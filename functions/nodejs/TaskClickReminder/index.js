// 通过 NPM dependencies 成功安装 NPM 包后此处可引入使用
// 如安装 linq 包后就可以引入并使用这个包
// const linq = require("linq");
const {createLimiter} = require("../utils");
/**
 * @param {Params}  params     自定义参数
 * @param {Context} context    上下文参数，可通过此参数下钻获取上下文变量信息等
 * @param {Logger}  logger     日志记录器
 *
 * @return 函数的返回数据
 */
module.exports = async function (params, context, logger) {
    // 日志功能
    logger.info(`${new Date()} 任务一键催办函数开始执行`);

    const {object_task_create_monitor} = params;
    if (!object_task_create_monitor) {
        logger.warn("未传入任务处理记录")
        return {code: false, message: "未传入任务处理记录"}
    }
    //获取普通任务
    const res = await application.data.object("object_store_task")
        .select("name", "option_priority", "source_department", "task_create_time", "deadline_time","task_handler","task_chat")
        .where({task_monitor: {_id: object_task_create_monitor._id}})
        .find();
    //待发送飞书消息列表
    let messageCardSendDatas = []
    for (const item in res) {
        const name = item.description;
        logger.info("item->",JSON.stringify(item,null,2));
        const content = {
            "config": {
                "wide_screen_mode": true
            },
            "elements": [
                {
                    "tag": "div",
                    "text": {
                        "content": "任务优先级：" + item.option_priority,
                        "tag": "plain_text"
                    }
                },
                {
                    "tag": "div",
                    "text": {
                        "content": "任务来源：" + item.source_department._name,
                        "tag": "plain_text"
                    }
                },
                {
                    "tag": "div",
                    "text": {
                        "content": "任务下发时间：" + item.task_create_time,
                        "tag": "plain_text"
                    }
                },
                {
                    "tag": "div",
                    "text": {
                        "content": "距离截至时间还有" + item.deadline_time + "小时",
                        "tag": "plain_text"
                    }
                }
            ],
            "header": {
                "template": "turquoise",
                "title": {
                    "content": "【催办消息】有一条"+name+"门店任务请尽快处理！",
                    "tag": "plain_text"
                }
            }
        }
        let json = JSON.stringify(content);
        const data = {
            receive_id_type: "", //接收方类型：open_id/user_id/union_id/email/chat_id text
            msg_type: "interactive", //消息类型：text、post、image、file、audio、media、sticker、interactive、share_chat、share_user text
            receive_id: "", //接收方ID text
            content: json, //消息卡片内容  JSON
        }
        if (item.task_chat) {
            //获取群组ID
            const feishuChat = await application.data.object('object_feishu_chat')
                .select('_id', 'chat_id')
                .where({_id: item.task_chat._id}).findOne();
            data.receive_id_type = "chat_id"
            data.receive_id = feishuChat.chat_id
            messageCardSendDatas.push(data);
        } else {
            const feishuPeople = await application.data.object('_user')
                .select('_id', '_email')
                .where({_id: item.task_handler._id}).findOne();
            data.receive_id_type = "open_id"
            try {
                const emails = [];
                emails.push(feishuPeople._email);
                //获取open_id
                const res = await client.contact.user.batchGetId({
                    params: {user_id_type: "open_id"},
                    data: {emails: emails}
                });
                const user = res.data.user_list.map(item => ({
                    email: item.email,
                    open_id: item.user_id
                }));
                data.receive_id = user[0].open_id;
                messageCardSendDatas.push(data);
            } catch (error) {
                logger.error(`[${feishuPeople._id}]用户邮箱为null！`, error);
            }
        }
    }
    //创建限流器
    const limitedsendFeishuMessage = createLimiter(sendFeishuMessage);
    //发送飞书卡片消息
    logger.info(`任务一键催办待发送飞书消息数量->${messageCardSendDatas.length}`);
    const sendFeishuMessageResults = await Promise.all(messageCardSendDatas.map(messageCardSendData => limitedsendFeishuMessage(messageCardSendData)));
    const sendFeishuMessageSuccess = sendFeishuMessageResults.filter(result => result.code === 0);
    const sendFeishuMessageFail = sendFeishuMessageResults.filter(result => result.code !== 0);
    logger.info(`任务一键催办成功数量: ${sendFeishuMessageSuccess.length}, 失败数量: ${sendFeishuMessageFail.length}`);
    return {
        code: true,
        message: `任务一键催办成功数量: ${sendFeishuMessageSuccess.length}, 失败数量: ${sendFeishuMessageFail.length}`
    }
}
const sendFeishuMessage = async (messageCardSendData) => {
    try {
        await faas.function('MessageCardSend').invoke(messageCardSendData);
        return {code: 0, message: `飞书消息发送成功`, result: 'success'};
    } catch (error) {
        return {code: -1, message: error.message, result: 'failed'};
    }
};
