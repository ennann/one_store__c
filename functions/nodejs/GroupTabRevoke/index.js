const { newLarkClient, batchOperation } = require('../utils');

/**
 * @param {Params}  params     自定义参数
 * @param {Context} context    上下文参数，可通过此参数下钻获取上下文变量信息等
 * @param {Logger}  logger     日志记录器
 *
 * @return 函数的返回数据
 */
module.exports = async function (params, context, logger) {
    logger.info('开始执行批量删除群置顶标签函数\n', { timestamp: new Date(), user: context.user._id });

    const { chat_pin } = params;

    if (!chat_pin) {
        logger.error('缺少需要删除的置顶');
        return { code: -1, message: '缺少需要删除的置顶' };
    }

    // 获取群置顶的群聊ID
    const chat_record_list = await faas.function('GroupTabDeployRange').invoke({ chat_tab_deploy_range: chat_pin });
    const chat_id_list = chat_record_list.map(item => item.chat_id);
    logger.info('根据群置顶规则获取到的群ID列表为', chat_id_list);

    // 定义一个删除函数
    const deleteGroupTab = async (client, chat_id, tab_name) => {
        try {
            let chat_tab_response = await client.im.chatTab.listTabs({
                path: {
                    chat_id: chat_id,
                },
            });
            // logger.info('获取群置顶标签结果', JSON.stringify(chat_tab_response, null, 4));

            if (chat_tab_response.code !== 0) {
                return { chat_id, result: 'failed', message: '获取群置顶标签失败: ' + chat_tab_response.msg || chat_tab_response.message };
            }

            // 获取所有 tab_name 相等的 tab_id
            const tab_ids = chat_tab_response.data.chat_tabs.filter(item => item.tab_name === tab_name).map(item => item.tab_id);

            if (tab_ids.length === 0) {
                return { chat_id, result: 'failed', message: `群内未找到名为 ${tab_name} 的置顶标签` };
            }

            let delete_response = await client.im.chatTab.deleteTabs({
                path: {
                    chat_id: chat_id,
                },
                data: {
                    tab_ids: tab_ids,
                },
            });

            if (delete_response.code !== 0) {
                return { chat_id, result: 'failed', message: '删除群置顶标签失败: ' + delete_response.msg || delete_response.message };
            }
            return { chat_id, result: 'success', message: `成功删除群置顶 - ${chat_pin.pin_name}` };
        } catch (error) {
            return { chat_id, result: 'failed', message: error.message };
        }
    };

    // 循环 chat_id_list 创建 Promise
    const client = await newLarkClient({ userId: context.user._id }, logger);

    const deletePromises = chat_id_list.map(chat_id => deleteGroupTab(client, chat_id, chat_pin.pin_name));

    // 并发执行 Promise
    const deleteResults = await Promise.all(deletePromises);

    logger.info('删除群置顶标签结果', deleteResults);

    const batch_delete_ids = [];
    await application.data
        .object('object_chat_pin_relation')
        .select('_id')
        .where({ chat_pin: chat_pin._id })
        .findStream(async record => {
            batch_delete_ids.push(...record.map(item => item._id));
        });
    logger.info('需要删除的群置顶关系数据ID列表', batch_delete_ids);

    if (batch_delete_ids.length > 0) {
        batchOperation(logger, 'object_chat_pin_relation', 'batchDelete', batch_delete_ids);
    }


    return { deleteResults };
};
