import React from '@react';
class Express extends React.Component {
    constructor() {
        super();
        this.state = {
            title: '使用 React 编写小程序',
            pages: [
                {
                    title: 'API',
                    url: '/pages/demo/express/api/index'
                },
                {
                    title: '继承',
                    url: '/pages/demo/express/extend/index'
                },
                {
                    title: '无状态组件',
                    url: '/pages/demo/express/stateless/index'
                },
                {
                    title: '一重循环',
                    url: '/pages/demo/express/loop/index'
                },
                {
                    title: '三重循环',
                    url: '/pages/demo/express/loop3/index'
                },
                {
                    title: '行内样式',
                    url: '/pages/demo/express/inlineStyle/index'
                },
                {
                    title: '组件套嵌内容',
                    url: '/pages/demo/express/children/index'
                }
                
            ]
        };
    }
    config = {
        'navigationBarTextStyle': '#fff',
        'navigationBarBackgroundColor': '#0088a4',
        'navigationBarTitleText': 'Demo',
        'backgroundColor': '#eeeeee',
        'backgroundTextStyle': 'light'
    }
    render() {
        return (
            <div class='container'>
                <div class='page_hd'>{this.state.title}</div>
                <div class='page_bd'>
                    <div class='navigation'>
                        {
                            this.state.pages.map(function(page) {
                                return <navigator open-type="navigate" class='item' hover-class="navigator-hover" url={page.url}>{page.title}</navigator>;
                            })
                        }
                    </div>
                </div>
            </div>
        );
    }
}
export default Express;
