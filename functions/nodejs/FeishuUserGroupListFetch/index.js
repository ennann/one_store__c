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
    // 日志功能
    logger.info('开始执行查询飞书用户组列表函数\n', { timestamp: new Date(), user: context.user._id });

    let client = await newLarkClient({ userId: context.user._id }, logger);

    // Initialize the array to store group data.
    const allGroups = [];

    try {
        // Retrieve group list with pagination handling
        for await (const item of await client.contact.group.simplelistWithIterator({
            params: {
                page_size: 100,
                type: 1,
            },
        })) {
            // logger.info('接收到群组批次数据长度：', item.grouplist.length);
            allGroups.push(...item.grouplist);
        }
    } catch (error) {
        // Log the error and return an empty array if an error occurs.
        logger.error('查询飞书用户组列表时发生错误：', error);
        return []; // Return an empty array to indicate failure or no data retrieved.
    }

    logger.info('查询到的所有群组：', allGroups.length);
    return allGroups;



};
