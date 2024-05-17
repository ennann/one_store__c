// 通过 NPM dependencies 成功安装 NPM 包后此处可引入使用
// 如安装 linq 包后就可以引入并使用这个包
// const linq = require("linq");
const dayjs = require("dayjs");
const { createLimiter } = require('../utils');
/**
 * @param {Params}  params     自定义参数
 * @param {Context} context    上下文参数，可通过此参数下钻获取上下文变量信息等
 * @param {Logger}  logger     日志记录器
 *
 * @return 函数的返回数据
 */
module.exports = async function (params, context, logger) {
  // 日志功能
  logger.info(`重试-发送消息 函数开始执行`, params);

  const { record } = params;

  const sendMessage = async ({ content, msg_type, receive_id, receive_id_type, _id }) => {
    const msgInfo = { content, msg_type, receive_id, receive_id_type };
    logger.info({ msgInfo });
    try {
      const res = await faas.function('MessageCardSend').invoke({ ...msgInfo });
      return { ...res, _id };
    } catch (error) {
      logger.error("发送消息失败", error);
    }
  };

  const records = await application.data.object("object_message_log")
    .where({
      message_send: { _id: record._id },
      result: "option_failed"
    })
    .select("content", "msg_type", "receive_id", "receive_id_type", "_id")
    .find();

  if (records.length === 0) {
    logger.info("记录中没有发送失败的消息，无需重试");
    return
  }

  // 限流器
  const limitSendMessage = createLimiter(sendMessage);
  // 统一调用发送
  const sendMessageResult = await Promise.all(records.map((item) => limitSendMessage(item)));
  const successRecords = sendMessageResult.filter(i => i.code === 0);
  const failRecords = sendMessageResult.filter(i => i.code !== 0);
  logger.info("总数", sendMessageResult.length);
  logger.info("成功数量", successRecords.length);
  logger.info("失败数量", failRecords.length);
  const recordData = await application.data.object("object_message_send")
    .where({ _id: record._id })
    .select("success_count")
    .findOne();
  let counts = {};

  if (sendMessageResult.every(i => i.code === 0)) {
    // 重试全部成功
    counts = {
      fail_count: 0,
      success_count: recordData.success_count + sendMessageResult.length,
    }
  } else {
    // 部分成功
    counts = {
      fail_count: failRecords.length,
      success_count: recordData.success_count + successRecords.length,
    }
  }

  // 需要更新的日志记录
  const logData = successRecords.map((item) => ({
    _id: item._id,
    result: "option_success"
  }))

  try {
    await application.data.object("object_message_send").update({
      _id: record._id,
      send_end_datetime: dayjs().valueOf(),
      ...counts
    });
    await application.data.object("object_message_log").batchUpdate(logData);
    logger.info("更新消息发送记录及日志成功");
  } catch (error) {
    logger.error("更新消息发送记录及日志失败", error);
  }
}