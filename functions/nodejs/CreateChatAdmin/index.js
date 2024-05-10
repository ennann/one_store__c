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
  // logger.info(`${new Date()} 函数开始执行`);

  // 在这里补充业务代码

  let response = {
    code: 0,
    message: ""
  }

  const { chat_id, open_ids: manager_ids } = params;

  logger.info({ params })

  const client = await newLarkClient({ userId: context.user._id }, logger);
  
  if (!chat_id) {
    response.code = -1;
    response.message = "群组ID缺失，无法继续执行";
    logger.error("群组ID缺失，无法继续执行");
    throw new Error("群组ID缺失，无法继续执行");
  }
  if (!manager_ids || manager_ids.length === 0) {
    response.code = -1;
    response.message = "管理员ID缺失，无法继续执行";
    logger.error("群组ID缺失，无法继续执行");
    throw new Error("群组ID缺失，无法继续执行");
  }

  try{
    // 获取群成员
    // const res = await client.im.chatMembers.get({
    //   path: { chat_id },
    //   params: { member_id_type: 'open_id' },
    // })
    // logger.info({res})
    //创建群管理员
    const set_chat_admin_res = await client.im.chatManagers.addManagers({
      path: { chat_id },
      params: { member_id_type: 'open_id' },
      data: { manager_ids },
    })
    if (set_chat_admin_res.code !== 0) {
      logger.error("API返回错误", JSON.stringify(set_chat_admin_res, null, 2));
      response.code = -2;
      response.message = "设置群管理员失败";
      throw new Error("设置群管理员失败");
    }else{
      response.message = "设置群管理员成功";
      return response;
    }
  }catch (error) {
    logger.error("设置群管理员失败", error);
    response.code = -1;
    response.message = "设置群管理员失败";
    throw new Error("设置群管理员失败");
  }
}
