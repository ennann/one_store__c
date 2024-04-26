// 通过 NPM dependencies 成功安装 NPM 包后此处可引入使用
// 如安装 linq 包后就可以引入并使用这个包
// const linq = require("linq");
const { newLarkClient, batchOperation } = require('../utils');

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

    const { chat_id, bot_app_id } = params;

    if (!chat_id || !bot_app_id) {
        logger.error('错误：缺少群聊ID或机器人ID');
        return { code: -1, message: '错误：缺少群聊ID或机器人ID' };
    }

    const client = await newLarkClient({ app_id: bot_app_id }, logger);

    let response = await client.im.chatMembers.create({
        path: {
            chat_id: chat_id,
        },
        params: {
            member_id_type: 'app_id',
            succeed_type: 1,
        },
        data: {
            id_list: [bot_app_id],
        },
    });

    if (response.code !== 0) {
        logger.error('机器人加群失败', response);
        return { code: -2, message: '机器人加群失败', result: response?.data };
    }

    return { code: 0, message: '机器人加群成功', result: response?.data };
};
