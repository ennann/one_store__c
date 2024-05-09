const { newLarkClient, createLimiter, batchOperation } = require('../utils');

/**
 * 群置顶分发函数
 * 
 * @param {Params}  params     自定义参数
 * @param {Context} context    上下文参数
 * @param {Logger}  logger     日志记录器
 * @return {Object} 返回处理结果
 */
module.exports = async function (params, context, logger) {
    logger.info('开始执行群置顶分发函数', { timestamp: new Date(), user: context.user._id });
    logger.info(params);

    const { chat_pin } = params;
    if (!chat_pin || !chat_pin._id) {
        logger.error('错误：缺少群置顶信息');
        return { code: -1, message: '错误：缺少群置顶信息' };
    }

    const chatRecordList = await faas.function('DeployChatRange').invoke({ deploy_rule: chat_pin.chat_rule });
    const chatIdList = chatRecordList.map(item => item.chat_id);

    if (!chatIdList || chatIdList.length === 0) {
        logger.error('查询结果为空，未找到对应的群聊');
        return { code: -2, message: '未找到对应的群聊，无法分发' };
    }

    // 清理 pin_url 中的换行和空格
    let { pin_name, pin_url, pin_icon } = chat_pin;
    pin_url = pin_url.replace(/[\n\s]/g, '');

    const client = await newLarkClient({ userId: context.user._id }, logger);

    // 定义将置顶信息添加到群聊的函数
    const addPinToChat = async (chat_id) => {
        try {
            let image_key = null;
            // 处理图标上传
            if (pin_icon && pin_icon.length > 0 && pin_icon[0]) {
                const file = await context.resources.file.download(pin_icon[0]);
                const image_key_res = await client.im.image.create({
                    data: {
                        image_type: 'message',
                        image: file,
                    },
                });

                if (image_key_res.code === 0) {
                    image_key = image_key_res.image_key;
                }
            }

            const group_tab_res = await client.im.chatTab.create({
                path: { chat_id },
                data: {
                    chat_tabs: [
                        {
                            tab_name: pin_name,
                            tab_type: 'url',
                            tab_content: { url: pin_url },
                            tab_config: { icon_key: image_key, is_built_in: false },
                        },
                    ],
                },
            });

            if (group_tab_res.code !== 0) {
                throw new Error('群置顶创建失败: ' + group_tab_res.message);
            }

            return { code: 0, chat_id, message: '群置顶创建成功', result: 'success' };
        } catch (error) {
            return { code: -1, chat_id, message: error.message, result: 'failed' };
        }
    };

    // 创建限流器
    const limitedAddPinToChat = createLimiter(addPinToChat);

    // 并行执行添加置顶信息到群聊的操作
    const addPinResults = await Promise.all(chatIdList.map(chat_id => limitedAddPinToChat(chat_id)));

    const successList = addPinResults.filter(item => item.code === 0);
    const failedList = addPinResults.filter(item => item.code !== 0);

    logger.info(`成功数量 ${successList.length}，失败数量 ${failedList.length}`);

    // Optional: Batch create relationship data if necessary
    const batchCreateData = successList.map(item => ({
        union_id: `${pin_name}-${chat_pin._id}-${item.chat_id}`,
        chat_pin: { _id: chat_pin._id },
        chat: { _id: chatRecordList.find(chat => chat.chat_id === item.chat_id)._id },
    }));

    const create_pin_chat_relation = async (data) => {
        try {
            await application.data.object('object_chat_pin_relation').create(data);
            return { code: 0, message: '创建关系成功', result: 'success' };
        } catch (error) {
            return { code: -1, message: error.message, result: 'failed' };
        }
    }

    const createRelationResults = await Promise.all(batchCreateData.map(data => create_pin_chat_relation(data)));
    logger.info('创建群置顶和群的关系结果', JSON.stringify(createRelationResults, null, 2));

    if (failedList.length>0){
        throw new Error(`分发群菜单失败，请联系管理员！`);
    }

    return {
        code: successList.length > 0 ? 0 : -1,
        message: '群置顶分发完成',
        data: {
            success_count: successList.length,
            success_list: successList,
            failed_count: failedList.length,
            failed_list: failedList,
        },
    };
};
