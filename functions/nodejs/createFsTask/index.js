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
  logger.info(`${new Date()} 函数开始执行`);
  const { taskRecord } = params;

  logger.info({ taskRecord });

  const client = await newLarkClient({ userId: context.user._id }, logger);

  const createTask = async () => {
    try {
      const taskRes = await client.task.v2.task.create({
        data: {
          summary: taskRecord.name,
          description: taskRecord.description,
          due: {
            is_all_day: true,
            timestamp: new Date(taskRecord.datetime_end).getTime(),
          },
        },
      });

      logger.info({ taskRes });
      if (taskRes.code === 0) {
        return { taskGuid: taskRes.data.task.guid, taskUrl: taskRes.data.task.url };
      }

      logger.error('创建任务失败：', taskRes);
      return;
    } catch (e) {
      logger.error('创建任务异常：', e);
      return;
    }
  };

  const data = await createTask();
  if (data) {
    try {
      const res = await client.task.v2.task.addMembers({
        path: { task_guid: data.taskGuid },
        data: {
          members: [{
            role: 'assignee',
            id: "ou_ac1f06d7be75633f74165a487da8cf3d"
          }]
        },
      });
      logger.info({ res });

      if (res.code !== 0) {
        logger.error('添加任务负责人失败', res.msg);
      }
    } catch (e) {
      logger.error(e)
    }
  }
}
