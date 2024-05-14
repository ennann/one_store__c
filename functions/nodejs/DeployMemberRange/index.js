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
  logger.info(`获取人员信息函数开始执行`);

  const { user_rule } = params;
  let userList = [];

  if (!user_rule) {
    logger.error('错误：缺少人员筛选规则');
    return userList;
  }

  const ruleRecord = await application.data
    .object('object_user_rule')
    .select(['_id', 'job_position', 'department', 'work_team'])
    .where({ _id: user_rule._id || user_rule.id })
    .findOne();
  logger.info('object_user_rule', JSON.stringify(ruleRecord, null, 2));

  const getUserRecord = async (query, description) => {
    try {
      const userRecords = [];
      await application.data
        .object('_user')
        .select('_id', '_email')
        .where(query)
        .findStream(async records => {
          userRecords.push(...records.map(item => ({ _id: item._id, email: item._email })));
        });
      return userRecords;
    } catch (error) {
      logger.error(`${description}查询时发生错误：`, error);
      return userList;
    }
  };

  // 获取所属部门下的人员
  if (ruleRecord.department && ruleRecord.department.length > 0) {
    const departmentIds = ruleRecord.department.map(item => item._id);
    const users = await getUserRecord(
      {
        _department: {
          _id: application.operator.hasAnyOf(departmentIds),
        },
      },
      '所属部门',
    );
    logger.info({ departmentUsers: users });
    userList.push(...users);
  }

  // 获取所属用户组下的人员
  if (ruleRecord.work_team && ruleRecord.work_team.length > 0) {
    const teamIds = ruleRecord.work_team.map(item => item._id);
    const teamUserList = await application.data
      .object('object_user_group_member')
      .select('user')
      .where({
        user_group: {
          _id: application.operator.hasAnyOf(teamIds),
        },
      })
      .find();
    logger.info({ teamUserList });
    const users = await getUserRecord({ _id: application.operator.hasAnyOf(teamUserList.map(item => item.user._id)) }, '所属用户组');
    logger.info({ teamUser: users });
    userList.push(...users);
  }

  userList = userList.filter((item, index, self) => self.findIndex(t => t.email === item.email) === index);
  logger.info({ userList });

  if (userList.length === 0) {
    logger.error('通过人员筛选条件获取人员列表为空');
    return [];
  }

  const client = await newLarkClient({ userId: context.user._id }, logger);
  try {
    const res = await client.contact.user.batchGetId({
      params: { user_id_type: 'open_id' },
      data: { emails: userList.map(i => i.email) },
    });
    logger.info({ res });
    if (res.code !== 0) {
      throw new Error('通过人员筛选条件获取人员失败');
    }
    return res.data.user_list.map(item => ({
      email: item.email,
      open_id: item.user_id,
    }));
  } catch (error) {
    logger.error('通过人员筛选条件获取人员失败');
    throw new Error('通过人员筛选条件获取人员失败');
  }
};
