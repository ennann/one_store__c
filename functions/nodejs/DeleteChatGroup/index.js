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
  const { chat_id } = params;

  logger.info('参数', params);

  if (!chat_id) {
    logger.error('错误：缺少 chat_id 参数');
    return { code: -1, message: '缺少 chat_id 参数' };
  }

  const client = await newLarkClient({ userId: context.user._id }, logger);

  try {
    // 获取群聊成员
    let chatMembers = [];

    await (async () => {
      for await (const item of await client.im.chatMembers.getWithIterator({
        path: {
          chat_id: chat_id,
        },
        params: {
          member_id_type: 'user_id',
        },
      })) {
        chatMembers.push(...item.items);
      }
    })();

    // chatMembers = chatMembers.items;

    logger.info('获取群聊成员', JSON.stringify(chatMembers, null, 2));

    // 移除群聊成员

    // 判断 chatMembers 是否为空
    if (chatMembers.length > 0) {
      const removeMemberFromChat = async memberId => {
        client.im.chatMembers.delete({
          path: { chat_id },
          params: { member_id_type: "user_id" },
          data: { id_list: [ memberId ] },
        });
      };

      // 使用 Promise.all() 并发移除群聊成员
      await Promise.all(chatMembers.map(member => removeMemberFromChat(member.member_id)));

      return { code: 0, message: '移除群聊成员成功' };
    }
    return { code: 0, message: '没有群成员可以移除' };
  } catch (e) {
    return { code: -1, message: '移除群聊失败'+e.message };
  }
};
