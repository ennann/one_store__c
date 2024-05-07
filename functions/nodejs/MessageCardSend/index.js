const { newLarkClient } = require('../utils');

/**
 * @param {Params}  params     自定义参数
 * @param {Context} context    上下文参数，可通过此参数下钻获取上下文变量信息等
 * @param {Logger}  logger     日志记录器
 *
 * @return 函数的返回数据
 */
module.exports = async function (params, context, logger) {
    const { receiver_type, receiver_id, message_type, message_content } = params;
    const receiveIdTypes = new Set(['open_id', 'user_id', 'email', 'chat_id']);

    // 判断 receiver_type 是否合法
    if (!receiveIdTypes.has(receiver_type)) {
        logger.error(`错误的 receiver_type 类型: ${receiver_type}`);
        return { code: -1, receiver_id, message: '错误的 receiver_type 类型' };
    }

    // 判断 receiver_id 和 message_content 是否为空
    if (!receiver_id || !message_type || !message_content) {
        logger.error(
            `receiver_id 或 message_content 不能为空. Received - receiver_id: ${receiver_id}, message_type: ${message_type}, message_content: ${message_content}`,
        );
        return { code: -1, receiver_id, message: 'receiver_id 或 message_content 不能为空' };
    }

    const client = await newLarkClient({ userId: context.user._id }, logger);

    try {
        let response = await client.im.message.create({
            params: {
                receiveIdTypes: receiver_type,
            },
            data: {
                receive_id: receiver_id,
                msg_type: message_type, // text interactive
                content: message_content,
            },
        });

        if (response.code !== 0) {
            logger.error(`发送消息失败: ${response.msg}`);
            return { code: -1, receiver_id, message: `发送消息失败: ${response.msg}`, details: response.data };
        }

        return { code: 0, message: '发送消息成功', data: response.data };
    } catch (e) {
        logger.error('发送消息失败', { error: e });
        return { code: -1, receiver_id, message: '发送消息失败', e };
    }
};
