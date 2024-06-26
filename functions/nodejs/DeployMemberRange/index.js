// 通过 NPM dependencies 成功安装 NPM 包后此处可引入使用
// 如安装 linq 包后就可以引入并使用这个包
// const linq = require("linq");
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
    .object("object_user_rule")
    .select(["_id", "job_position", "department", "work_team"])
    .where({ _id: user_rule._id || user_rule.id })
    .findOne();
  logger.info('object_user_rule', JSON.stringify(ruleRecord, null, 2));

  const getUserRecord = async (query, description) => {
    try {
      const userRecords = [];
      await application.data
        .object('_user')
        .select('_id', '_email', "_phoneNumber")
        .where(query)
        .findStream(async records => {
          userRecords.push(...records.map(item => ({ _id: item._id, email: item._email, mobile: item._phoneNumber?.number })));
        });
      return userRecords
    } catch (error) {
      logger.error(`${description}查询时发生错误：`, error);
      return userList;
    }
  };

  // 获取部门多层级下的人员
  const getDepartmentUser = async (ids) => {
    const list = [];
    const users = await getUserRecord(
      { _department: { _id: application.operator.hasAnyOf(ids) } },
      '所属部门'
    );
    list.push(...users);
    // 获取以当前部门为上级部门的子部门
    const childDepartment = await application.data
      .object('_department')
      .select("_id")
      .where({ _superior: { _id: application.operator.hasAnyOf(ids) } })
      .find();
    logger.info({ childDepartment });
    if (childDepartment.length > 0) {
      const childDepartmentUsers = await getDepartmentUser(childDepartment.map(item => item._id));
      list.push(...childDepartmentUsers);
    }
    return list;
  }

  // 获取所属部门下的人员
  if (ruleRecord.department && ruleRecord.department.length > 0) {
    const departmentIds = ruleRecord.department.map(item => item._id);
    const users = await getDepartmentUser(departmentIds);
    logger.info({ departmentUsers: users });
    userList.push(...users);
  }

  // 获取所属用户组下的人员
  if (ruleRecord.work_team && ruleRecord.work_team.length > 0) {
    const teamIds = ruleRecord.work_team.map(item => item._id);
    const teamUserList = await application.data
      .object('object_user_group_member')
      .select("user")
      .where({
        user_group: {
          _id: application.operator.hasAnyOf(teamIds)
        }
      })
      .find();
    const users = await getUserRecord(
      { _id: application.operator.hasAnyOf(teamUserList.map(item => item.user._id)) },
      '所属用户组'
    );
    logger.info({ teamUsers: users });
    userList.push(...users);
  }

  userList = userList.filter((item, index, self) => self.findIndex(t => t.email === item.email || t.mobile === item.mobile) === index);
  // userList = [...userList, { email: "huanghongzhi.4207@bytedance.com", _id: 1798564594579460 }];
  logger.info({ userList });

  if (userList.length === 0) {
    logger.error("通过人员筛选条件获取人员列表为空");
    return [];
  }

  // 获取人员信息
  const getUserInfo = async (user) => {
    try {
      const query = user.mobile
        ? { _phoneNumber: application.operator.contain(user.mobile) }
        : { _email: application.operator.contain(user.email) };
      const res = await application.data.object("_user")
        .select("_id", "_name", "_email", "_phoneNumber", "_lark_user_id")
        .where(query)
        .findOne();
      return {
        ...res,
        user_id: res._lark_user_id
      };
    } catch (error) {
      logger.error("通过人员筛选条件获取人员失败");
    }
  };

  try {
    const list = userList.filter(item => !!item.email || !!item.mobile)
      .map(item => getUserInfo(item));
    const resList = await Promise.all(list);
    logger.info(resList);
    return resList;
  } catch (error) {
    logger.error("获取人员失败", error);
    throw new Error("获取人员失败", error);
  }
}