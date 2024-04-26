const lark = require('@larksuiteoapi/node-sdk');
const { newLarkClient, getUserIdByEmails } = require('../utils');

/**
 * @param {Params}  params     自定义参数
 * @param {Context} context    上下文参数，可通过此参数下钻获取上下文变量信息等
 * @param {Logger}  logger     日志记录器
 *
 * @return 函数的返回数据
 */
module.exports = async function (params, context, logger) {
  logger.info("函数开始执行");
  logger.info({ timestamp: new Date(), user: context.user._id });
  logger.info(params);
  
  const { appId } = await application.integration.getDefaultTenantAccessToken();
  logger.info("appId", appId);

  let response = {
    code: 0,
    message: ""
  }

  
  const client = await newLarkClient({ userId: context?.user?._id }, logger); // 创建 Lark 客户端

  if (!params.code) {
    logger.error("授权码(code)缺失");
    response.code = -1;
    response.message = "授权码(code)缺失，无法继续执行";
    return response;
  }

  let user_access_token_res;
  try {
    user_access_token_res = await client.authen.oidcAccessToken.create({
      data: {
        grant_type: 'authorization_code',
        code: params.code,
      },
    });
    logger.info("用户访问令牌获取结果", user_access_token_res);
  } catch (error) {
    logger.error("获取用户访问令牌失败", error);
    response.code = -1;
    response.message = "获取用户访问令牌失败";
    return response;
  }

  if (user_access_token_res.code !== 0) {
    logger.error("API返回错误", user_access_token_res);
    response.code = user_access_token_res.code;
    response.message = "获取用户访问令牌失败";
    return response;
  }

  let set_chat_admin_res;
  try {
    set_chat_admin_res = await client.im.chatManagers.addManagers({
      path: {
        chat_id: params.chat_id,
      },
      params: {
        member_id_type: 'app_id',
      },
      data: {
        manager_ids: [ appId ],
      },
    }, lark.withUserAccessToken(user_access_token_res.data.access_token));

    logger.info("设置聊天管理员结果", set_chat_admin_res);
  } catch (error) {
    logger.error("设置聊天管理员失败", error);
    response.code = -1;
    response.message = "设置聊天管理员失败";
    return response;
  }

  if (set_chat_admin_res.code !== 0) {
    logger.error("API返回错误", set_chat_admin_res);
    response.code = set_chat_admin_res.code;
    response.message = "设置聊天管理员失败";
    return response;
  }

  response.message = "设置机器人管理员成功";
  return response;

}