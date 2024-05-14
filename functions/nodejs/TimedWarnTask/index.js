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
    // logger.info(`${new Date()} 函数开始执行`);
    // 获取符合条件的门店普通任务
    const {object_store_task} = params;
    if (!object_store_task){
        return {code: -1,message:"无符合提醒条件的门店普通任务记录"}
    }
    //需要发送提醒的消息记录
    const messageCardSendDatas = [];
    for (const objectStoreTaskElement of object_store_task) {
        let name = objectStoreTaskElement.name;
        let description = objectStoreTaskElement.description
        const content = {
            "config": {
                "wide_screen_mode": true
            },
            "elements": [
                {
                    "tag": "div",
                    "text": {
                        "content": description,
                        "tag": "plain_text"
                    }
                }
            ],
            "header": {
                "template": "turquoise",
                "title": {
                    "content": name,
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
       if (objectStoreTaskElement.task_chat){
           //获取群组ID
           const feishuChat = await application.data.object('object_feishu_chat')
               .select('_id', 'chat_id')
               .where({_id: objectStoreTaskElement.task_chat._id}).findOne();
           data.receive_id_type = "chat_id"
           data.receive_id = feishuChat.chat_id
           messageCardSendDatas.push(data);
       }else{
           data.receive_id_type = "email"
           const feishuPeople = await application.data.object('_user')
               .select('_id', '_email')
               .where({_id: objectStoreTaskElement.task_handler._id}).findOne();
           data.receive_id = feishuPeople._email
           messageCardSendDatas.push(data);
       }
    }
    //创建限流器
    const limitedsendFeishuMessage = createLimiter(sendFeishuMessage);
    //发送飞书卡片消息
    logger.info(`任务定期提醒数量:${messageCardSendDatas.length}」` );
    const sendFeishuMessageResults = await Promise.all(messageCardSendDatas.map(messageCardSendData => limitedsendFeishuMessage(messageCardSendData)));
    const sendFeishuMessageSuccess = sendFeishuMessageResults.filter(result => result.code === 0);
    const sendFeishuMessageFail = sendFeishuMessageResults.filter(result => result.code !== 0);
    logger.info(`任务定期提醒成功数量: ${sendFeishuMessageSuccess.length}, 失败数量: ${sendFeishuMessageFail.length}`);
    return {code: 0,message:`任务定期提醒成功数量: ${sendFeishuMessageSuccess.length}, 失败数量: ${sendFeishuMessageFail.length}`}
}
const sendFeishuMessage = async (messageCardSendData) => {
    try {
        await faas.function('MessageCardSend').invoke(messageCardSendData);
        return {code: 0, message: `飞书消息发送成功`, result: 'success'};
    } catch (error) {
        return {code: -1, message: error.message, result: 'failed'};
    }
};
