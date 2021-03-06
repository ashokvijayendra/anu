import React from '@react';
import Dialog from '@components/Dialog/index';

class P extends React.Component {
    constructor() {
        super();
        this.state = {
            show: false
        };
    }

    toggleDialog() {
        // eslint-disable-next-line
        this.setState({
            show: !this.state.show
        });
    }
    render() {
        return (
            <div>
                <div>类继承的演示</div>
                {this.state.show ? <Dialog><p>777</p></Dialog> : null}

                <p>
                    <button type="primary" onTap={this.toggleDialog.bind(this)}>
                        点我
                    </button>
                </p>
            </div>
        );
    }
}

export default P;
