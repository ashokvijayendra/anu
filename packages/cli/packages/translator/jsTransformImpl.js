const t = require('babel-types');
const generate = require('babel-generator').default;
const nPath = require('path');
const helpers = require('./helpers');
const queue = require('./queue');
const utils = require('./utils');
const deps = require('./deps');
const prettifyXml = require('prettify-xml');

function getAnu(state) {
    return state.file.opts.anu;
}
/**
 * JS文件转译器
 */
module.exports = {
    ClassDeclaration: helpers.classDeclaration,
    //babel 6 没有ClassDeclaration，只有ClassExpression
    ClassExpression: helpers.classDeclaration,
    ClassMethod: {
        enter(path, state) {
            var modules = getAnu(state);
            var methodName = path.node.key.name;
            modules.walkingMethod = methodName;
            if (methodName !== 'constructor') {
                var fn = helpers.method(path, methodName);
                modules.thisMethods.push(fn);
            } else {
                var node = path.node;
                modules.ctorFn = t.functionDeclaration(
                    t.identifier(modules.className),
                    node.params,
                    node.body,
                    node.generator,
                    false
                );
            }
            helpers.render.enter(
                path,
                '有状态组件',
                modules.className,
                modules
            );
        },
        exit(path, state) {
            var modules = getAnu(state);
            const methodName = path.node.key.name;
            if (methodName === 'render') {
                //当render域里有赋值时, BlockStatement下面有的不是returnStatement,而是VariableDeclaration
                helpers.render.exit(
                    path,
                    '有状态组件',
                    modules.className,
                    modules
                );
            }
        }
    },
    FunctionDeclaration: {
        //enter里面会转换jsx中的JSXExpressionContainer
        exit(path, state) {
            //函数声明转换为无状态组件
            let modules = getAnu(state);
            let name = path.node.id.name;
            if (
                /^[A-Z]/.test(name) &&
                modules.componentType === 'Component' &&
                !modules.parentName
            ) {
                //需要想办法处理无状态组件
                helpers.render.exit(path, '无状态组件', name, modules);
            }
        }
    },
    ImportDeclaration(path, state) {
        let node = path.node;
        let modules = getAnu(state);
        let source = node.source.value;
        let specifiers = node.specifiers;
        if (modules.componentType === 'App') {
            if (/\/pages\//.test(source)) {
                modules['appRoute'] = modules['appRoute'] || [];
                modules['appRoute'].push(nPath.join(source));
                path.remove(); //移除分析依赖用的引用
            }
        }

        if (/\.(less|scss)$/.test(nPath.extname(source))) {
            path.remove();
        }

        specifiers.forEach(item => {
            //重点，保持所有引入的组件名及它们的路径，用于<import />
            modules.importComponents[item.local.name] = source;

            //process alias for package.json alias field;
            helpers.resolveAlias(path, modules, item.local.name);
        });
        helpers.copyNpmModules(modules.current, source, node);
    },

    ExportNamedDeclaration: {
        //小程序在定义
        enter() {},
        exit(path) {
            let declaration = path.node.declaration;
            if (!declaration) {
                var map = path.node.specifiers.map(function(el) {
                    return helpers.exportExpr(el.local.name);
                });
                path.replaceWithMultiple(map);
            } else if (declaration.type === 'Identifier') {
                path.replaceWith(
                    helpers.exportExpr(declaration.name, declaration.name)
                );
            } else if (declaration.type === 'VariableDeclaration') {
                var id = declaration.declarations[0].id.name;
                declaration.kind = 'var'; //转换const,let为var
                path.replaceWithMultiple([declaration, helpers.exportExpr(id)]);
            } else if (declaration.type === 'FunctionDeclaration') {
                path.replaceWithMultiple([declaration, helpers.exportExpr(id)]);
            }
        }
    },

    ClassProperty(path, state) {
        let key = path.node.key.name;
        let modules = getAnu(state);
        if (key === 'config') {
            //format json
            let code = generate(path.node.value).code;
            let config = null;
            let jsonStr = '';
            try {
                config = JSON.parse(code);
            } catch (err) {
                config = eval('(' + code + ')');
            }

            //assign the page routes in app.js
            if (modules.componentType === 'App') {
                config = Object.assign(config, {
                    pages: modules['appRoute']
                });
                delete modules['appRoute'];
            }
            if (config.usingComponents) {
                //将页面配置对象中的usingComponents对象中的组件名放进modules.customComponents
                //数组中，并将对应的文件复制到dist目录中
                utils.copyCustomComponents(config.usingComponents, modules);
            }
            jsonStr = JSON.stringify(config, null, 4);

            queue.pageConfig.push({
                type: 'json',
                path: modules.sourcePath
                    .replace(new RegExp(`${nPath.sep}src${nPath.sep}`), `${nPath.sep}dist${nPath.sep}`)
                    .replace(/\.js$/, '.json'),
                code: jsonStr
            });
        }
        if (path.node.static) {
            var keyValue = t.ObjectProperty(t.identifier(key), path.node.value);
            modules.staticMethods.push(keyValue);
        } else {
            if (key == 'globalData' && modules.componentType === 'App') {
                var thisMember = t.assignmentExpression(
                    '=',
                    t.memberExpression(t.identifier('this'), t.identifier(key)),
                    path.node.value
                );
                modules.thisProperties.push(thisMember);
            }
        }
        path.remove();
    },
    MemberExpression() {},
    AssignmentExpression(path, state) {
        let modules = getAnu(state);
        // 转换微信小程序component的properties对象为defaultProps
        let left = path.node.left;
        if (
            modules.className &&
            t.isMemberExpression(left) &&
            left.object.name === modules.className &&
            left.property.name === 'defaultProps'
        ) {
            helpers.defaultProps(path.node.right.properties, modules);
            path.remove();
        }
    },
    CallExpression(path, state) {
        let node = path.node;
        let args = node.arguments;
        let callee = node.callee;
        let modules = getAnu(state);
        //移除super()语句
        if (modules.walkingMethod == 'constructor') {
            if (callee.type === 'Super') {
                path.remove();
                return;
            }
        }
        if (
            path.parentPath.type === 'JSXExpressionContainer' &&
            callee.type == 'MemberExpression' &&
            callee.property.name === 'map' &&
            !args[1] &&
            args[0].type === 'FunctionExpression'
        ) {
            args[1] = t.identifier('this');
        }
    },

    //＝＝＝＝＝＝＝＝＝＝＝＝＝＝处理JSX＝＝＝＝＝＝＝＝＝＝＝＝＝＝
    JSXOpeningElement: {
        //  enter: function(path) {},
        enter: function(path, state) {
            let modules = getAnu(state);
            let nodeName = path.node.name.name;
            if (modules.importComponents[nodeName]) {
                var set = deps[nodeName] || (deps[nodeName] = new Set());
                modules.usedComponents[nodeName] = true;
                path.node.name.name = 'React.template';
                var children = path.parentPath.node.children;
                var isEmpty = true;
                // eslint-disable-next-line
                for (var i = 0, el; (el = children[i++]); ) {
                    if (el.type === 'JSXText' && !el.value.trim().length) {
                        isEmpty = false;
                        break;
                    } else {
                        isEmpty = false;
                        break;
                    }
                }

                var attributes = path.node.attributes;
                attributes.push(
                    utils.createAttribute(
                        'templatedata',
                        'data' + utils.createUUID()
                    ),
                    t.JSXAttribute(
                        t.JSXIdentifier('is'),
                        t.jSXExpressionContainer(t.identifier(nodeName))
                    )
                );
                if (!isEmpty) {
                    path.fragmentUid = 'f' + path.node.start + path.node.end;
                    set.add(path.fragmentUid);
                    attributes.push(
                        utils.createAttribute('classUid', modules.classUid),
                        utils.createAttribute(
                            'instanceUid',
                            t.jSXExpressionContainer(
                                t.identifier('this.props.instanceUid')
                            )
                        ),
                        utils.createAttribute('fragmentUid', path.fragmentUid)
                    );
                }
            } else {
                if (nodeName != 'React.template') {
                    helpers.nodeName(path, modules);
                }
            }
        },
        exit(path, state) {
            if (path.fragmentUid) {
                let modules = getAnu(state);
                var template = utils.createElement(
                    'template',
                    [utils.createAttribute('name', path.fragmentUid)],
                    path.parentPath.node.children
                );
                var wxml = helpers
                    .wxml(generate(template).code, modules)
                    .replace(/;$/, '');
                if (!modules.fragmentPath) {
                    modules.fragmentPath =
                        modules.sourcePath.split(`src${nPath.sep}pages`)[0] +
                        `dist${nPath.sep}components${nPath.sep}Fragments${nPath.sep}`;
                }
                queue.wxml.push({
                    type: 'wxml',
                    path: modules.fragmentPath + path.fragmentUid + '.wxml',
                    code: prettifyXml(wxml, {
                        indent: 2
                    })
                });
            }
        }
    },
    JSXAttribute: function(path, state) {
        let modules = getAnu(state);
        let attrName = path.node.name.name;
        let attrValue = path.node.value;
        var attrs = path.parentPath.node.attributes;
        if (/^(?:on|catch)[A-Z]/.test(attrName)) {
            var n = attrName.charAt(0) == 'o' ? 2 : 5;
            var eventName = attrName.slice(n).toLowerCase();
            var name = `data-${eventName}-uid`;
            attrs.push(utils.createAttribute(name, 'e'+path.node.start+path.node.end));
            if (!attrs.setClassCode) {
                attrs.setClassCode = true;
                var keyValue;
                for (var i = 0, el; (el = attrs[i++]); ) {
                    if (el.name.name == 'key') {
                        if (t.isLiteral(el.value)) {
                            keyValue = el.value;
                        } else if (t.isJSXExpressionContainer(el.value)) {
                            keyValue = el.value;
                        }
                    }
                }
                attrs.push(
                    utils.createAttribute('data-class-uid', modules.classUid),
                    t.JSXAttribute(
                        t.JSXIdentifier('data-instance-uid'),
                        t.jSXExpressionContainer(
                            t.identifier('this.props.instanceUid')
                        )
                    )
                );
                if (keyValue != undefined) {
                    attrs.push(
                        t.JSXAttribute(t.JSXIdentifier('data-key'), keyValue)
                    );
                }
            }
        } else if (
            attrName === 'style' &&
            t.isJSXExpressionContainer(attrValue)
        ) {
            var expr = attrValue.expression;
            var styleType = expr.type;
            var styleRandName = 'style' + utils.createUUID();
            if (styleType === 'Identifier') {
                // 处理形如 <div style={formItemStyle}></div> 的style结构
                var styleName = expr.name;
                attrs.push(
                    t.JSXAttribute(
                        t.JSXIdentifier('style'),
                        t.jSXExpressionContainer(
                            t.identifier(
                                `React.collectStyle(${styleName}, this.props, '${styleRandName}')`
                            )
                        )
                    )
                );
                path.remove();
            } else if (styleType === 'ObjectExpression') {
                // 处理形如 style={{ width: 200, borderWidth: '1px' }} 的style结构
                var styleValue = generate(expr).code;
                attrs.push(
                    t.JSXAttribute(
                        t.JSXIdentifier('style'),
                        t.jSXExpressionContainer(
                            t.identifier(
                                `React.collectStyle(${styleValue}, this.props, '${styleRandName}')`
                            )
                        )
                    )
                );
                path.remove();
            }
        }
    },

    JSXClosingElement: function(path, state) {
        let modules = getAnu(state);
        let nodeName = path.node.name.name;
        if (
            !modules.importComponents[nodeName] &&
            nodeName !== 'React.template'
        ) {
            helpers.nodeName(path, modules);
        } else {
            path.node.name.name = 'React.template';
        }
    }
};
