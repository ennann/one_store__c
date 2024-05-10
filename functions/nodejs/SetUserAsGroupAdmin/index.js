// 通过 NPM dependencies 成功安装 NPM 包后此处可引入使用
// 如安装 linq 包后就可以引入并使用这个包
// const linq = require("linq");
const { newLarkClient } = require('../utils');
const { getUserIdByEmails, getOpenIdByEmailsOrMobiles } = require("../utils");
/**
 * @param {Params}  params     自定义参数
 * @param {Context} context    上下文参数，可通过此参数下钻获取上下文变量信息等
 * @param {Logger}  logger     日志记录器
 *
 * @return 函数的返回数据
 */
module.exports = async function (params, context, logger) {
  // 在这里补充业务代码
  const { object_feishu_chat, chat_info } = params;
  const chat_id = chat_info.data.chat_id;
  const res = {
    code: 0,
    message: "群管理员设置成功"
  }
  if (!object_feishu_chat) {
    res.code = -1
    res.message = "缺少必须参数"
    throw new Error({ res, params, message: "缺少必须参数" })
  }
  if (!chat_id) {
    res.code = -1
    res.message = "缺少必须参数：chat_id"
    logger.error(res);
    throw new Error({ res, params, message: "缺少必须参数：chat_id" })
  }
  if (!object_feishu_chat.chat_managers) {
    res.code = -1
    res.message = "缺少必须参数：群管理员人员记录"
    logger.error(res);
    throw new Error({ res, params, message: "缺少必须参数：群管理员人员记录" })
  }
  try {
    const useIds = object_feishu_chat.chat_managers.map(item => item._id)
    const userList = await application.data.object("_user")
    .where({
      _id: application.operator.in(useIds.join(","))
    })
    .select('_email').find();
    const emails = userList.map(item => item._email);

    logger.info({useIds, emails})

    //获取open_id
    const { data } = await getOpenIdByEmailsOrMobiles(emails, [], logger)
    const open_ids = data.user_list.map(item => item.user_id);

    //设置管理员
    try{
      await faas.function('CreateChatAdmin').invoke({ chat_id, open_ids });
      return { res, chat_id, open_ids,  }
    }catch(error){
      res.code = -1
      res.message = error
      throw new Error({ res, chat_id, open_ids, error })
    }
  } catch (e) {
    res.code = -1
    res.message = e
    logger.error({ res, chat_id, open_ids });
    throw new Error({ res, chat_id, open_ids, e })
  }
}
