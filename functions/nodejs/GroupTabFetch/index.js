const { newLarkClient } = require('../utils');

/**
 * @param {Params}  params     自定义参数
 * @param {Context} context    上下文参数，可通过此参数下钻获取上下文变量信息等
 * @param {Logger}  logger     日志记录器
 *
 * @return 函数的返回数据
 */
module.exports = async function (params, context, logger) {

  logger.info("开始执行函数\n", JSON.stringify({ timestamp: new Date(), user: context.user._id }, null, 2));
  logger.info(params);

  let response = {
    code: 0,
    message: "",
    data: null
  };

  if (!params.chat_id) {
    logger.error("缺少必要参数: 群聊ID");
    response.code = -1;
    response.message = "缺少必要参数: 群聊ID";
    return response;
  }

  let client = await newLarkClient({ userId: context.user._id }, logger);

  try {
    let chat_tab_list = await client.im.chatTab.listTabs({
      path: {
        chat_id: params.chat_id,
      },
    });

    logger.info("获取群置顶标签列表成功", { chat_tab_list });

    response.data = chat_tab_list; // Assuming chat_tab_list is the object to be returned
    response.message = "群置顶标签列表获取成功";
  } catch (error) {
    logger.error("获取群置顶标签列表失败", { error });
    response.code = -1;
    response.message = "获取群置顶标签列表失败: " + error.message;
  }

  logger.info("函数执行完毕", JSON.stringify(response, null, 2));

  return response;

}