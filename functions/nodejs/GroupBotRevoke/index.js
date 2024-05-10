const { newLarkClient, createLimiter, batchOperation } = require('../utils');

/**
 * @param {Params}  params     自定义参数
 * @param {Context} context    上下文参数，可通过此参数下钻获取上下文变量信息等
 * @param {Logger}  logger     日志记录器
 *
 * @return 函数的返回数据
 */
module.exports = async function (params, context, logger) {
    // 日志功能
    logger.info('开始执行群置顶分发函数', { timestamp: new Date(), user: context.user._id });
    logger.info(params);

    const { chat_bot } = params;
    if (!chat_bot || !chat_bot._id) {
        logger.error('错误：缺少群置顶信息');
        return { code: -1, message: '错误：缺少群置顶信息' };
    }

    // 调用函数获取群置顶的群聊ID列表
    const chatRecordList = await faas.function('DeployChatRange').invoke({ deploy_rule: chat_bot.chat_rule });
    const chatIdList = chatRecordList.map(item => item.chat_id);
    logger.info('根据规则获取到的群ID列表为', chatIdList);

    if (!chatIdList || chatIdList.length === 0) {
        logger.error('查询结果为空，未找到对应的群聊');
        return { code: -2, message: '未找到对应的群聊，无法分发' };
    }

    // 获取机器人信息并创建客户端实例
    const { bot_app_id } = chat_bot;
    const client = await newLarkClient({ userId: context.user._id }, logger);

    // 定义将机器人添加到群聊的函数
    const removeBotFromChat = async chat_id => {
        try {
            const response = await client.im.chatMembers.delete({
                path: { chat_id },
                params: {
                    member_id_type: 'app_id',
                },
                data: {
                    id_list: [bot_app_id],
                },
            });

            if (response.code !== 0) {
                throw new Error(`机器人 ${bot_app_id} 移出群聊 ${chat_id} 失败，错误信息：${response.msg}`);
            }

            return { code: 0, chat_id, message: '机器人移出群聊成功', result: 'success' };
        } catch (error) {
            return { code: -1, chat_id, message: error.message, result: 'failed' };
        }
    };

    // 创建限流器
    const limitedRemoveBotFromChat = createLimiter(removeBotFromChat);

    // 并行执行将机器人移除群聊的操作
    const removeBotResults = await Promise.all(chatIdList.map(chat_id => limitedRemoveBotFromChat(chat_id)));
    logger.info('机器人移出群聊的结果', removeBotResults);

    // 处理成功和失败的结果
    const successList = removeBotResults.filter(item => item.code === 0);
    const failedList = removeBotResults.filter(item => item.code !== 0);

    logger.info(`成功数量 ${successList.length}，失败数量 ${failedList.length}`);
    logger.info('成功列表', successList);
    logger.info('失败列表', failedList);

    // 找到关系表中的所有当前机器人关系
    const batchDeleteIds = [];
    await context.db
        .object('object_chat_bot_relation')
        .select('_id')
        .where({ bot: chat_bot._id })
        .findStream(async records => {
            batchDeleteIds.push(...records.map(item => item._id));
        });
    // logger.info('找到的机器人关系列表', bot_chat_relations);

    if (batchDeleteIds.length > 0) {
        batchOperation(logger, 'object_chat_pin_relation', 'batchDelete', batchDeleteIds);
    }

    return { code: 0, message: '机器人移出群聊成功' };
};
