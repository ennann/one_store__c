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
  logger.info(`${new Date()} 函数开始执行`, params);
  const { storeTaskId } = params;

  const taskRecord = await application.data.object('object_store_task')
    .where({ _id: storeTaskId })
    .select("name", "description", "task_plan_time", "_id", "option_upload_attachementdd", "attachment", "option_upload_imagede", "image")
    .findOne();

  logger.info({ taskRecord });

  const client = await newLarkClient({ userId: context.user._id }, logger);

  // 创建飞书任务
  const createTask = async () => {
    try {
      const taskRes = await client.task.v2.task.create({
        data: {
          summary: taskRecord.name,
          description: taskRecord.description,
          due: {
            is_all_day: true,
            timestamp: taskRecord.task_plan_time
          },
        },
      });

      logger.info({ taskRes });
      if (taskRes.code === 0) {
        return { taskGuid: taskRes.data.task.guid, taskUrl: taskRes.data.task.url };
      }
      logger.error('创建任务失败：', taskRes);
    } catch (e) {
      logger.error('创建任务异常：', e);
    }
  };

  // 添加负责人
  const updateMember = async (record) => {
    try {
      // 获取人员
      // const userList = await faas.function('DeployMemberRange').invoke({ user_rule: taskRecord.user_rule });
      if (userList.length === 0) {
        throw new Error('缺少人员信息');
      }
      // 飞书任务更新负责人
      const res = await client.task.v2.task.addMembers({
        path: { task_guid: record.taskGuid },
        data: {
          members: userList.map(item => ({
            role: 'assignee',
            id: item.open_id
          }))
        },
      });
      logger.info({ res });
      if (res.code !== 0) {
        throw new Error('添加任务负责人失败', res);
      }
    } catch (error) {
      throw new Error("添加任务负责人失败", error);
    }
  };

  // 上传附件
  const uploadFile = async (token, resource_id) => {
    try {
      const file = await application.resources.file.download(token);
      await client.task.v2.attachment.upload({
        path: { user_id_type: "open_id" },
        data: {
          file,
          resource_id,
          resource_type: "task",
        }
      })
    } catch (error) {
      logger.error("上传文件失败", error);
    }
  };

  // 添加附件
  const updateAttachment = async (record) => {
    const fileList = [];
    if()
  };

  const data = await createTask();

  if (data) {
    try {
      // Apaas任务更新飞书任务ID
      await application.data
        .object("object_store_task")
        .update(
          taskRecord._id,
          { task_guid: data.taskGuid }
        );
      await updateMember(data);
    } catch (e) {
      logger.error(e);
    }
  }
}

const userList = [
  {
    email: 'huanghongzhi.4207@bytedance.com',
    open_id: 'ou_ac1f06d7be75633f74165a487da8cf3d',
    _id: 1798564594579460
  },
  // {
  //   email: 'wangshujian@bytedance.com',
  //   open_id: 'ou_36c533e1bfe5010ab11f5420e8a76651',
  //   _id: 1798280532476963
  // },
  // {
  //   email: 'liujinxiang@bytedance.com',
  //   open_id: 'ou_e4ff6dfa99c7e8573d461532b3c61159',
  //   _id: 1798281387786314
  // },
  // {
  //   email: 'liuhao@bytedance.com',
  //   open_id: 'ou_d3cec0e220bf8206bfd83ced8250462c',
  //   _id: 1798281746550820
  // },
  // {
  //   email: 'zhaoyizhe@bytedance.com',
  //   open_id: 'ou_e2999ed80997a3d5817c37815fcb99ac',
  //   _id: 1798281554498611
  // },
];
