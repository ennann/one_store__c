const { newLarkClient } = require('../utils');

/**
 * @param {Params}  params     自定义参数
 * @param {Context} context    上下文参数，可通过此参数下钻获取上下文变量信息等
 * @param {Logger}  logger     日志记录器
 *
 * @return 函数的返回数据
 */
module.exports = async function (params, context, logger) {
  logger.info("发送消息卡片函数开始执行", params);
  const { receive_id_type, receive_id, msg_type, content } = params;
  const receiveIdTypes = new Set(['open_id', 'user_id', 'email', "union_id", 'chat_id']);

  // 判断 receive_id_type 是否合法
  if (!receiveIdTypes.has(receive_id_type)) {
    logger.error(`错误的 receive_id_type 类型: ${receive_id_type}`);
    throw new Error('错误的 receive_id_type 类型')
  }

  // 判断 receive_id 和 content 是否为空
  if (!receive_id || !msg_type || !content) {
    logger.error(
      `receive_id 或 content 不能为空. Received - receive_id: ${receive_id}, msg_type: ${msg_type}, content: ${content}`,
    );
    throw new Error('receive_id 或 content 或 msg_type 不能为空')
  }

  const client = await newLarkClient({ userId: context.user._id }, logger);
  try {
    let response = await client.im.message.create({
      params: { receive_id_type },
      data: {
        receive_id,
        msg_type,
        content
      },
    });

    if (response.code !== 0) {
      logger.error("消息发送失败", response);
      return { code: -1 };
    }
    return response;
  } catch (e) {
    logger.error("消息发送", e);
  }
};
