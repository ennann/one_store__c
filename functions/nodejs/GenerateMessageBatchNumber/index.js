/**
 * @param {Params}  params     自定义参数
 * @param {Context} context    上下文参数，可通过此参数下钻获取上下文变量信息等
 * @param {Logger}  logger     日志记录器
 *
 * @return 函数的返回数据
 */
module.exports = async function (params, context, logger) {
  // 日志功能
  logger.info(`生成消息记录批次号 函数开始执行`, params);

  const { record } = params;

  try {
    const records = await application.data.object('object_message_send')
      .select('_id', 'batch_no')
      .where({ message_send_def: { _id: record._id } })
      .find();
    const data = await application.data.object('object_chat_message_def')
      .select('_id', 'number')
      .where({ _id: record._id })
      .findOne();
    const newBatchNo = `${(records.length + 1).toString().padStart(6, '0')}`;
    return data.number + '-' + newBatchNo;
  } catch (error) {
    logger.error(error);
    throw new Error(error);
  }
};
