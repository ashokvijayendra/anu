import { returnFalse } from 'react-core/util';

export var eventSystem = {
    classCache: {},
    dispatchEvent: function(e) {
        var target = e.currentTarget;
        var dataset = target.dataset || {};
        var eventUid = dataset[e.type + 'Uid']; //函数名
        var classUid = dataset.classUid; //类ID
        var componentClass = eventSystem.classCache[classUid]; //类
        var instanceUid = dataset.instanceUid; //实例ID
        var instance = componentClass.instances[instanceUid];
        var key = dataset['key'];
        if (instance) {
            try {
                var fn = instance.$$eventCached[eventUid + (key !=null ? '-' + key : '')];

                fn && fn.call(instance, createEvent(e, target));
            } catch (e) {
                console.log(e.stack);
            }
        }
    }
};
//创建事件对象
function createEvent(e, target) {
    var event = e.detail || {};
    event.stopPropagation = function() {
        console.warn('小程序不支持这方法，请使用catchXXX');
    };
    event.preventDefault = returnFalse;
    event.type = e.type;
    event.currentTarget = event.target = target;
    event.touches = e.touches;
    event.timeStamp = e.timeStamp;
    return event;
}
