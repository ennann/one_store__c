const dayjs = require('dayjs');
const _ = application.operator;

/**
 * @param {Params}  params     自定义参数
 * @param {Context} context    上下文参数，可通过此参数下钻获取上下文变量信息等
 * @param {Logger}  logger     日志记录器
 *
 * @return 函数的返回数据
 */
module.exports = async function (params, context, logger) {
  // 日志功能


  // const messageDefineFields = await application.metadata.object("object_chat_message_def").getFields();
  // // logger.info(`fields: ${JSON.stringify(fields, null, 4)}`);
  // const fieldApiNames = messageDefineFields.map(item => item.apiName);
  // // logger.info(fieldApiNames);


   
  query = {}
  let user_records = await application.data.object("_user")
    .select("_id", "_name", "_email", "_department",  "_phoneNumber", "_lark_user_id")
    .where(query)
    .find();
  
  console.info(user_records);

  await application.data.object('object_chat_member').create({
    chat_member: { _id: 1798280532476963, _name: [ { language_code: 2052, text: '王书建' } ] }
  })


  return


  const currentDate = dayjs().format("YYYY-MM-DD");
  const currentTime = dayjs().valueOf(); // 当前时间
  const timeBuffer = 1000 * 60 * 5; // 5 minutes buffer
  logger.info('当前时间->', currentDate, currentTime, dayjs(currentTime).format('YYYY-MM-DD HH:mm:ss'));

  // 查询所有的消息定义数据
  const messageDefineRecords = await application.data
    .object('object_chat_message_def')
    .select(
      '_id',
      'title',
      'option_method',
      'option_time_cycle', // 天、周、月、季度、年
      'repetition_rate', // 重复频次
      'datetime_start', // 重复任务开始时间
      'datetime_end', // 重复任务结束时间
      'boolean_public_now',
      'datetime_publish', // 发布时间
      'option_status' // 等于 option_enable
    )
    .where(
      _.or(
        _.and({
          option_status: 'option_enable',
          option_method: 'option_cycle',
          datetime_start: _.lte(currentTime),
          datetime_end: _.gte(currentTime)
        }), // 周期消息的条件
        _.and({
          option_status: 'option_enable',
          option_method: 'option_once',
          boolean_public_now: false,
          datetime_publish: _.lte(currentTime + timeBuffer), // 5分钟内的消息
          datetime_publish: _.gte(currentTime - timeBuffer)
        }) // 一次性消息的条件
      )
    )
    .find();

  logger.info('查询到的消息定义数量->', messageDefineRecords.length);
  logger.info(messageDefineRecords);

  return



  let record = await application.data.object('object_chat_message_def').select('message_richtext').findOne();
  logger.info(record)
  logger.info(record.message_richtext)

  return

  1798578190072842

  let task = await application.data.object("object_store_task").select('task_handler', 'task_handler_department').where({ _id: 1799010105175067 }).findOne()
  logger.info(task)


  let object_feishu_chat = await application.data.object("object_feishu_chat")
    .select("_id", "chat_id")
    .where({ department: task.task_handler_department._id }).findOne();
  logger.info(object_feishu_chat)

  return


  const storeTaskPriorityDefine = await application.metadata.object('object_store_task').getField('option_priority');
  console.info(storeTaskPriorityDefine)
  let priorityName = storeTaskPriorityDefine.optionList.find(item => item.apiName === "option_01").label.find(item => item.language_code === 2052).text;
  console.info(priorityName)
  return



  logger.info('当前时间->', currentDate, currentTime, dayjs(currentTime).format('YYYY-MM-DD HH:mm:ss'));

}
