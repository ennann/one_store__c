// 通过 NPM dependencies 成功安装 NPM 包后此处可引入使用
// 如安装 linq 包后就可以引入并使用这个包
// const linq = require("linq");
const { convertRecordsToGroupMenu } = require('../GroupMenuUtils/groupMenuConstructor');
const { batchOperation, createLimiter } = require('../utils');

/**
 * @param {Params}  params     自定义参数
 * @param {Context} context    上下文参数，可通过此参数下钻获取上下文变量信息等
 * @param {Logger}  logger     日志记录器
 *
 * @return 函数的返回数据
 */
module.exports = async function (params, context, logger) {
    // 日志功能
    logger.info('开始执行群菜单分发函数', JSON.stringify({ timestamp: new Date(), user: context.user._id }));
    logger.info(params);

    // 在这里补充业务代码

    const { chat_menu_catalog } = params;

    if (!chat_menu_catalog || !chat_menu_catalog._id) {
        logger.error('错误：缺少菜单目录信息，请确认传入的参数是否正确');
        return {
            code: -1,
            message: '错误：缺少菜单目录信息，请确认传入的参数是否正确',
        };
    }
    //删除已分发的apass飞书群记录
    await deleteFeiShuGroupMenu(chat_menu_catalog,logger);
    const distributionChatListPromise = faas.function('DeployChatRange').invoke({ deploy_rule: chat_menu_catalog.chat_rule });

    const chatMenuRecordsPromise = application.data
        .object('object_chat_menu')
        .select(['_id', 'menu_catalog', 'name', 'menu_link', 'mobile_link', 'parent_menu'])
        .where({ menu_catalog: chat_menu_catalog._id || chat_menu_catalog.id })
        .orderBy("bigint_08e8b5a61dd")
        .find();

    // 获取分配的群聊列表和需要分配的菜单数据
    const [chatRecordList, chatMenuRecords] = await Promise.all([distributionChatListPromise, chatMenuRecordsPromise]);
    const chatIdList = chatRecordList.map(item => item.chat_id);

    if (!chatIdList || chatIdList.length === 0 || !chatMenuRecords || chatMenuRecords.length === 0) {
        logger.error('查询结果为空，未找到对应的群聊或菜单数据');
        return {
            code: -2,
            message: '未找到对应的群聊或菜单数据，无法分发',
        };
    }

    logger.info('查询到的群聊列表', JSON.stringify(chatIdList, null, 2));
    logger.info('查询到的菜单数据', JSON.stringify(chatMenuRecords, null, 2));

    const menu_data = convertRecordsToGroupMenu(chatMenuRecords); // 在循环内部消费 menu_data，所以这里不需要深拷贝
    logger.info('转换后的菜单数据', JSON.stringify(menu_data, null, 2));


    // 定义将群菜单设置到群聊的函数
    const setGroupMenu = async (chat_id, menu_data) => {
        try {
            // 1. 先获取群的菜单
            let current_chat_menu = await faas.function('GroupMenuFetch').invoke({ chat_id });
            if (current_chat_menu.code !== 0) {
                throw new Error(`获取群功能菜单失败，群聊${chat_id}，原因：${current_chat_menu.message}`);
            }

            if (current_chat_menu?.code === 0 && current_chat_menu?.data.menu_tree?.chat_menu_top_levels?.length > 0) {
                // 当前群已有菜单，需要先对菜单进行清空
                let chat_menu = current_chat_menu.data;
                let delete_res = await faas.function('GroupMenuDelete').invoke({ chat_id, chat_menu });
                if (delete_res.code !== 0) {
                    throw new Error(`删除群功能菜单失败，群聊${chat_id}，原因：${delete_res.message}`);
                }
            }

            // 2. 创建群功能菜单
            let menu_res = await faas.function('GroupMenuCreate').invoke({ chat_id, menu_data });

            if (menu_res.code !== 0) {
                throw new Error(`创建群功能菜单失败，群聊${chat_id}，原因：${menu_res.message}`);
            }

            return { code: 0, chat_id, message: `创建群功能菜单成功，群聊${chat_id}`, result: 'success',  };
        } catch (error) {
            return { code: -1, chat_id, message: error.message || `未知错误，群聊${chat_id}，`, result: 'failed' };
        }
    }

    // 创建限流器
    const limitedSetGroupMenu = createLimiter(setGroupMenu);

    // 并行执行群菜单设置的操作
    const setMenuResults = await Promise.all(chatIdList.map(chat_id => limitedSetGroupMenu(chat_id, menu_data)));
    logger.info('群菜单设置的结果', JSON.stringify(setMenuResults, null, 2));

    // 处理成功和失败的结果
    const successList = setMenuResults.filter(item => item.code === 0);
    const failedList = setMenuResults.filter(item => item.code !== 0);

    logger.info(`成功数量 ${successList.length}，失败数量 ${failedList.length}`);
    // logger.info('成功列表', JSON.stringify(successList, null, 2));
    // logger.info('失败列表', JSON.stringify(failedList, null, 2));

    // 根据成功列表准备批量更新数据
    const batchUpdateData = successList.map(item => ({
        _id: chatRecordList.find(chat => chat.chat_id === item.chat_id)._id,
        chat_catalog: { _id: chat_menu_catalog._id },
    }));

    logger.info('准备批量更新的数据', JSON.stringify(batchUpdateData, null, 2));


    // // 开始批量创建数据
    if (batchUpdateData.length > 0) {
        await batchOperation(logger, "object_feishu_chat", "batchUpdate", batchUpdateData);
        logger.info('批量更新群菜单字段完成');
    }
    if (failedList.length>0){
        throw new Error(`分发群菜单失败，请联系管理员！`);
    }
    return {
        code: successList.length > 0 ? 0 : -1,
        message: '批量更新群菜单字段完成',
        data: {
            success_count: successList.length,
            success_list: successList,
            failed_count: failedList.length,
            failed_list: failedList,
        },
    };
};

const deleteFeiShuGroupMenu = async (chat_menu_catalog,logger) => {
    try {
        //获取群菜单历史分发群
        const result = await application.data.object('object_feishu_chat').select('_id').where({chat_catalog:{_id:chat_menu_catalog._id}}).find();
        // 根据成功列表准备批量更新数据
        const batchUpdateData = result.map(item => ({
            _id: item._id,
            chat_catalog: null,
        }));
        // // 开始批量创建数据
        if (batchUpdateData.length > 0) {
            await batchOperation(logger, "object_feishu_chat", "batchUpdate", batchUpdateData);
            logger.info('批量更新飞书群菜单字段完成');
        }
    } catch (error) {
        logger.error('批量更新飞书群菜单字段完失败：'+error);
    }
};
