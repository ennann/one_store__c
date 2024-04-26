const { newLarkClient } = require('../utils');

/**
 * @param {Params}  params     自定义参数
 * @param {Context} context    上下文参数，可通过此参数下钻获取上下文变量信息等
 * @param {Logger}  logger     日志记录器
 *
 * @return 函数的返回数据
 */
module.exports = async function (params, context, logger) {
    logger.info('开始执行群菜单获取函数\n', JSON.stringify({ timestamp: new Date(), user: context.user._id }, null, 2));
    logger.info(params);

    let response = {
        code: 0,
        message: '',
        data: null,
    };

    if (!params.chat_id) {
        logger.error('缺少必要参数: 群聊ID');
        response.code = -1;
        response.message = '缺少必要参数: 群聊ID';
        return response;
    }

    let client = await newLarkClient({ userId: context.user._id }, logger);

    try {
        let group_menu_list = await client.im.chatMenuTree.get({
            path: {
                chat_id: params.chat_id,
            },
        });

        logger.info('获取群功能菜单成功', { group_menu_list });
        return {
            code: 0,
            message: '获取群功能菜单成功',
            data: group_menu_list.data,
        };
    } catch (error) {
        logger.error('获取群功能菜单失败', { error });
        response.code = -1;
        response.message = '获取群功能菜单失败: ' + error.message;
    }

    return response;
};
