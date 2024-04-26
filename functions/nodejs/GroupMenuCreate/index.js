const { newLarkClient } = require('../utils');
const { convertRecordsToGroupMenu } = require('../GroupMenuUtils/groupMenuConstructor');

/**
 * @param {Params}  params     自定义参数
 * @param {Context} context    上下文参数，可通过此参数下钻获取上下文变量信息等
 * @param {Logger}  logger     日志记录器
 *
 * @return 函数的返回数据
 */
module.exports = async function (params, context, logger) {
    // logger.info('开始执行创建群功能菜单函数', JSON.stringify({ timestamp: new Date(), user: context.user._id }, null, 2));
    // logger.info('接收的参数：');
    // logger.info(params);

    const { chat_id, menu_data } = params;

    if (!chat_id || !menu_data) {
        logger.error('错误：缺少群聊ID或菜单目录信息');
        return {
            code: -1,
            message: '缺少群聊ID或菜单目录信息',
        };
    }

    try {
        // const chatMenuRecordsPromise = application.data
        //     .object('object_chat_menu')
        //     .select(['_id', 'menu_catalog', 'name', 'menu_link', 'mobile_link', 'parent_menu'])
        //     .where({ menu_catalog: chat_menu_catalog._id })
        //     .find();

        // const [chat_menu_records] = await Promise.all([chatMenuRecordsPromise]);

        // if (!chat_menu_records || chat_menu_records.length === 0) {
        //     logger.error('查询结果为空，未找到对应的菜单数据');
        //     return {
        //         code: -2,
        //         message: '未找到对应的菜单数据',
        //     };
        // }

        // logger.info('查询到的菜单数据', JSON.stringify(chat_menu_records, null, 2));
        // let menu_data = convertRecordsToGroupMenu(chat_menu_records);
        // logger.info('转换后的菜单数据', JSON.stringify(menu_data, null, 2));

        let client = await newLarkClient({ userId: context.user._id }, logger);

        let menu_res = await client.im.chatMenuTree.create({
            path: {
                chat_id: chat_id,
            },
            data: menu_data,
        });

        // logger.info('群功能菜单创建成功', menu_res);
        return {
            code: 0,
            message: '群功能菜单创建成功',
            data: menu_res,
        };
    } catch (error) {
        logger.error('群功能菜单创建过程中发生错误', error);
        return {
            code: -3,
            message: '群功能菜单创建过程中发生错误: ' + error.message,
        };
    }
};
