// 通过 NPM dependencies 成功安装 NPM 包后此处可引入使用
// 如安装 linq 包后就可以引入并使用这个包
// const linq = require("linq");

const {getUserIdByEmails} = require("../utils");
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

    // 在这里补充业务代码
    const { object_feishu_chat } = params;
    const chat_id = object_feishu_chat.chat_id;
    const chat_managers = object_feishu_chat.chat_managers;
    const users = [];
    for (const chatManager of chat_managers) {
        logger.info("chatManager--->" + chatManager);
        //通过邮箱过去open_id
        const user_id = await getUserIdByEmails({ emails: chatManager._email },logger)
        user_id.forEach(userIdElement => users.push(userIdElement.user_id))
        logger.info("user_id--->" + user_id);
    }
    return await faas.function('CreateChatAdmin').invoke({chat_id: chat_id, open_ids: users});
}
