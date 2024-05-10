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
  const { chat_id } = params
  const client = await newLarkClient({ userId: context.user._id }, logger);
  const {appAccessToken} = await application.integration.getDefaultAppAccessToken();
  logger.info({res})
  // try {
  //   const res = await client.im.chat.delete({
  //     path: { chat_id },
  //   })
  //   logger.info({ res });
  //   return res;
  // } catch (error) {
  //   logger.error(error);
  //   throw new Error(error);
  // }
}
