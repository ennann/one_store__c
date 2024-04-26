// 通过 NPM dependencies 成功安装 NPM 包后此处可引入使用
// 如安装 linq 包后就可以引入并使用这个包
// const linq = require("linq");
const { convertRecordsToGroupMenu } = require('../GroupMenuUtils/groupMenuConstructor');
const { batchOperation } = require('../utils');

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

    const distributionChatListPromise = faas.function('GroupMenuDeployRange').invoke({ chat_menu_deploy_range: chat_menu_catalog });

    const chatMenuRecordsPromise = application.data
        .object('object_chat_menu')
        .select(['_id', 'menu_catalog', 'name', 'menu_link', 'mobile_link', 'parent_menu'])
        .where({ menu_catalog: chat_menu_catalog._id })
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

    // 对 chatIdList 进行循环，分别创建群功能菜单
    let success_count = 0;
    let failed_count = 0;
    let batchUpdateData = [];
    let fail_chat_list = [];

    for (let chat_id of chatIdList) {
        // 因为在循环内，调用太多次 logger 会导致日志过多，所以这里使用一个变量来记录日志，最后一次性输出，一个循环一个日志
        let loop_logs = `==> 开始处理群聊 ${chat_id}\n`;

        try {
            // 1. 先获取群的菜单
            let current_chat_menu = await faas.function('GroupMenuFetch').invoke({ chat_id });
            loop_logs += `==> 获取群功能菜单结果：${JSON.stringify(current_chat_menu)}\n`;

            if (current_chat_menu?.code === 0 && current_chat_menu?.data.menu_tree?.chat_menu_top_levels.length === 0) {
                //当前群没有菜单，可以创建
                loop_logs += '==> 当前群没有菜单，可以创建\n';
            } else {
                // 当前群已有菜单，需要先对菜单进行清空
                loop_logs += '==> 当前群已有菜单，需要先对菜单进行清空删除\n';
                let chat_menu = current_chat_menu.data;
                let delete_res = await faas.function('GroupMenuDelete').invoke({ chat_id, chat_menu });
                loop_logs += `==> 删除群功能菜单结果：${JSON.stringify(delete_res)}\n`;
            }

            // 2. 创建群功能菜单
            let menu_res = await faas.function('GroupMenuCreate').invoke({ chat_id, menu_data });
            loop_logs += `==> 创建群功能菜单结果：${JSON.stringify(menu_res)}\n`;

            batchUpdateData.push({
                _id: chatRecordList.find(item => item.chat_id === chat_id)._id,
                chat_catalog: { _id: chat_menu_catalog._id },
            });

            success_count++;
            logger.info(loop_logs);
        } catch (error) {
            loop_logs += `==> 群功能菜单创建失败，原因：${error.message}\n`;
            logger.error(loop_logs);
            failed_count++;
            fail_chat_id_list.push({
                chat_id,
                reason: error.message || '未知错误',
            });
        }
    }

    logger.info('群置顶分发完成，批量更新数据数量为 batchUpdateData ', batchUpdateData.length);
    logger.info(JSON.stringify(batchUpdateData, null, 2));
    logger.info(`成功数量 ${success_count}，失败数量 ${failed_count}，失败群聊列表 ${JSON.stringify(fail_chat_list, null, 2)}`);

    // // 开始批量创建数据
    if (batchUpdateData.length > 0) {
        await batchOperation(logger, "object_feishu_chat", "batchUpdate", batchUpdateData);
        logger.info('批量创建群置顶关系数据完成');
    }

    return {
        code: success_count > 0 ? 0 : -1,
        message: '群置顶分发完成',
        data: {
            success_count,
            failed_count,
            fail_chat_list,
        },
    };
};
