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
  // logger.info(`${new Date()} 函数开始执行`);

  // 在这里补充业务代码

  let response = {
    code: 0,
    message: ""
  }

  const { chat_id,open_ids } = params;

  const client = await newLarkClient({ userId: context.user._id }, logger);
  
  if (!params.chat_id) {
    logger.error("群组ID为空");
    response.code = -1;
    response.message = "群组ID缺失，无法继续执行";
    return response;
  }
  if (!params.open_ids) {
    logger.error("管理员ID为空");
    response.code = -1;
    response.message = "管理员ID缺失，无法继续执行";
    return response;
  }
  let set_chat_admin_res;
  try{
    //创建群管理员
    set_chat_admin_res = client.im.chatManagers.addManagers({
      path: {
        chat_id: chat_id,
      },
      params: {
        member_id_type: 'open_id',
      },
      data: {
        manager_ids: open_ids,
      },
    })
  }catch (error) {
    logger.error("设置群管理员失败", error);
    response.code = -1;
    response.message = "设置群管理员失败";
    return response;
  }

  if (set_chat_admin_res.code !== 0) {
    logger.error("API返回错误", set_chat_admin_res);
    response.code = set_chat_admin_res.code;
    response.message = "设置聊天管理员失败";
    return response;
  }

  response.message = "设置群管理员成功";
  return response;
}