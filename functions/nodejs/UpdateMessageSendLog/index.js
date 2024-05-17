// 通过 NPM dependencies 成功安装 NPM 包后此处可引入使用
// 如安装 linq 包后就可以引入并使用这个包
// const linq = require("linq");
const { chunkArray } = require('../utils');

/**
 * @param {Params}  params     自定义参数
 * @param {Context} context    上下文参数，可通过此参数下钻获取上下文变量信息等
 * @param {Logger}  logger     日志记录器
 *
 * @return 函数的返回数据
 */
module.exports = async function (params, context, logger) {
  // 日志功能
  logger.info(`更新消息发送日志 函数开始执行`, params);

  const { send_record, sendMessageResult, message_type, receive_id_type } = params;

  const batchCreateLogData = async (records) => {
    try {
      const recordList = records.map(item => ({
        message_type,
        message_id: item.data.message_id,
        message_send: { _id: send_record._id },
        receive_id_type,
        msg_type: item.data.msg_type,
        receive_id: item.data.chat_id,
        content: item.data.body.content,
        result: item.code === 0 ? "option_success" : "option_failed"
      }));
      const result = await application.data.object("object_message_log").batchCreate(recordList);
      logger.info("批量创建日志成功", { recordList, result });
    } catch (error) {
      logger.error("批量创建日志失败", error);
    }
  };

  try {
    // 将记录列表按照每个200的长度分成若干个数组
    const chunks = chunkArray(sendMessageResult);
    await Promise.all(chunks.map(item => batchCreateLogData(item)));
    logger.info("执行成功");
  } catch (error) {
    logger.error("执行失败", error);
  }
}