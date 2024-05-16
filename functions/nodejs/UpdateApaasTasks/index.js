// 通过 NPM dependencies 成功安装 NPM 包后此处可引入使用
// 如安装 linq 包后就可以引入并使用这个包
// const linq = require("linq");
const { newLarkClient } = require('../utils');

/**
 * @param {Params}  params     自定义参数
 * @param {Context} context    上下文参数，可通过此参数下钻获取上下文变量信息等
 * @param {Logger}  logger     日志记录器
 *
 * @return 函数的返回数据
 */
module.exports = async function (params, context, logger) {
  // 日志功能
  logger.info(`更新Apaas任务状态 函数开始执行`);

  const undoneList = [];
  await application.data
    .object("object_store_task")
    .where({
      task_guid: application.operator.notEmpty(),
      task_status: "option_pending"
    })
    .select("_id", "task_guid")
    .findStream(async (records) =>
      undoneList.push(...records)
    );

  logger.info({ undoneList });

  const client = await newLarkClient({ userId: context.user._id }, logger);
  for (const { task_guid, _id } of undoneList) {
    const res = await await client.task.v2.task.get({
      path: { task_guid }
    })
    logger.info({ res });
    if (res.code === 0) {
      const { task } = res.data;
      if (task?.completed_at) {
        await application.data
          .object("object_store_task")
          .update(
            _id,
            {
              task_status: "option_completed",
              task_finish_time: new Date(task.completed_at).getTime()
            }
          )
      }
    }
  }
}