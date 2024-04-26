const { newLarkClient, createLimiter } = require('../utils');

/**
 *
 * @param {Params}  params     自定义参数
 * @param {Context} context    上下文参数
 * @param {Logger}  logger     日志记录器
 * @return {Object} 返回处理结果
 */
module.exports = async function (params, context, logger) {
    logger.info('开始执行群机器人分发函数', { timestamp: new Date(), user: context.user._id });
    logger.info(params);

    const { chat_bot } = params;
    if (!chat_bot || !chat_bot._id) {
        logger.error('错误：缺少群机器人信息');
        return { code: -1, message: '错误：缺少群机器人信息' };
    }

    // 调用函数获取群机器人的群聊ID列表
    const chat_record_list = await faas.function('DeployChatRange').invoke({ deploy_rule: chat_bot.chat_rule });
    const chat_id_list = chat_record_list.map(item => item.chat_id);
    logger.info('根据规则获取到的群ID列表为', chat_id_list);

    if (!chat_id_list || chat_id_list.length === 0) {
        logger.error('查询结果为空，未找到对应的群聊');
        return { code: -2, message: '未找到对应的群聊，无法分发' };
    }

    // 获取机器人信息并创建客户端实例
    const { bot_app_id } = chat_bot;
    const client = await newLarkClient({ userId: context.user._id }, logger);

    // 定义将机器人添加到群聊的函数
    const addBotToChat = async (chat_id, bot_app_id) => {
        try {
            const response = await client.im.chatMembers.create({
                path: { chat_id },
                params: {
                    member_id_type: 'app_id',
                    succeed_type: 0,
                },
                data: {
                    id_list: [bot_app_id],
                },
            });

            if (response.code !== 0) {
                throw new Error(`机器人 ${bot_app_id} 加入群聊 ${chat_id} 失败，错误信息：${response.msg}`);
            }

            return { code: 0, chat_id, bot_app_id, message: '机器人加入群聊成功', result: 'success' };
        } catch (error) {
            return { code: -1, chat_id, bot_app_id, message: error.message, result: 'failed' };
        }
    };

    // 创建限流器
    const limitedAddBotToChat = createLimiter(addBotToChat);

    // 并行执行机器人添加到群聊的操作
    const add_bot_results = await Promise.all(chat_id_list.map(chat_id => limitedAddBotToChat(chat_id, bot_app_id)));
    logger.info('机器人加入群聊的结果', JSON.stringify(add_bot_results, null, 2));

    // 处理成功和失败的结果
    const success_list = add_bot_results.filter(item => item.code === 0);
    const failed_list = add_bot_results.filter(item => item.code !== 0);

    logger.info(`成功数量 ${success_list.length}，失败数量 ${failed_list.length}`);
    logger.info('成功列表', JSON.stringify(success_list, null, 2));
    logger.info('失败列表', JSON.stringify(failed_list, null, 2));

    // 根据成功列表准备批量创建数据关系
    const batch_create_data = success_list.map(item => ({
        union_id: `${bot_app_id}-${item.chat_id}`,
        bot: { _id: chat_bot._id },
        chat: { _id: chat_record_list.find(chat => chat.chat_id === item.chat_id)._id },
    }));
    logger.info('准备创建关系的数据', JSON.stringify(batch_create_data, null, 2));

    // 创建一个函数，机器人和群的关系
    const create_bot_chat_relation = async (data) => {
        try {
            await application.data.object('object_chat_bot_relation').create(data);
            return { code: 0, message: '创建关系成功', result: 'success' };
        } catch (error) {
            return { code: -1, message: error.message, result: 'failed' };
        }
    }

    // 并行执行创建关系的操作
    const create_relation_results = await Promise.all(batch_create_data.map(data => create_bot_chat_relation(data)));
    logger.info('创建机器人和群的关系结果', JSON.stringify(create_relation_results, null, 2));


    return {
        code: success_list.length > 0 ? 0 : -1,
        message: '群机器人分发完成',
        data: {
            success_count: success_list.length,
            success_list,
            failed_count: failed_list.length,
            failed_list,
        },
    };
};
