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
/**
 * @param {Params}  params     自定义参数
 * @param {Context} context    上下文参数，可通过此参数下钻获取上下文变量信息等
 * @param {Logger}  logger     日志记录器
 *
 * @return 函数的返回数据
 */
module.exports = async function (params, context, logger) {
    logger.info('开始执行删除群功能菜单函数\n', { timestamp: new Date(), user: context.user._id });
    logger.info('接收的参数：', params);

    const { chat_id, chat_menu } = params;

    if (!chat_id) {
        return { code: 400, msg: '未提供群聊ID，无法进行删除操作' };
    }

    let client = await newLarkClient({ userId: context.user._id }, logger);

    if (chat_menu) {
        // 从提供的chat_menu中获取ID列表
        const chat_menu_top_level_ids = chat_menu.menu_tree.chat_menu_top_levels.map(item => item.chat_menu_top_level_id);
        return deleteGroupMenu(client, chat_id, chat_menu_top_level_ids);
    } else {
        // 如果未提供chat_menu，从系统中获取现有菜单并删除
        try {
            let current_chat_menu = await faas.function('GroupMenuFetch').invoke({ chat_id:chat_id });
            if (!current_chat_menu || current_chat_menu.code !== 0) {
                return { code: 400, msg: '获取现有群菜单失败，无法删除' };
            }
            const chat_menu_top_level_ids = current_chat_menu.data.menu_tree.chat_menu_top_levels.map(item => item.chat_menu_top_level_id);
            return deleteGroupMenu(client, chat_id, chat_menu_top_level_ids);
        } catch (error) {
            return { code: 500, msg: '在获取现有群菜单时出错: ' + error.message };
        }
    }
};


const deleteGroupMenu = async (client, chat_id, chat_menu_top_level_ids) => {
    try {
        let res = await client.im.chatMenuTree.delete({
            path: {
                chat_id: chat_id,
            },
            data: { chat_menu_top_level_ids },
        });

        if (res.code !== 0) {
            throw new Error(`操作返回错误码: ${res.code}`);
        }
        return { code: 0, msg: '删除群菜单成功' };
    } catch (error) {
        return { code: 500, msg: '在删除群菜单时出错: ' + error.message };
    }
};
