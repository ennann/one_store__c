// 通过 NPM dependencies 成功安装 NPM 包后此处可引入使用
// 如安装 linq 包后就可以引入并使用这个包
// const linq = require("linq");
const { newLarkClient, getUserIdByEmails } = require('../utils');

/**
 * @param {Params}  params     自定义参数
 * @param {Context} context    上下文参数，可通过此参数下钻获取上下文变量信息等
 * @param {Logger}  logger     日志记录器
 *
 * @return 函数的返回数据
 */
module.exports = async function (params, context, logger) {
    // 日志功能
    // logger.info(`${new Date()} 函数开始执行`);

    // 在这里补充业务代码
    logger.info(params);
    const event_type = params?.event?.header?.event_type;

    // 第一步首先判断是否有 event_type 字段，如果有，才进行到下一步的 switch 判断
    if (!event_type) {
        logger.error('本次事件中，没有 event_type 字段，请检查');
        return {
            code: 400,
            msg: '本次事件中，没有事件类型字段，请检查参数是否正确',
        };
    }

    // 如果有 event_type 字段，再判断是哪种类型的事件
    logger.info('事件类型:', event_type);

    switch (event_type) {
        case 'im.chat.member.bot.added_v1':
            // im.chat.member.bot.added_v1 机器人进群事件
            logger.info('本次事件：机器人进入群聊事件');

            const client = await newLarkClient({ userId: context?.user?._id }, logger); // 创建 Lark 客户端

            const chat_id = params?.event?.event?.chat_id;
            const chat_name = params?.event?.event?.name;

            // 根据 chat_id 查找是否有群记录，如果
            let group_record = await application.data.object('object_feishu_chat').select('_id').where({ chat_id: chat_id }).findOne();

            if (!group_record) {
                // 如果没有群记录，则创建一个
                group_record = await application.data.object('object_feishu_chat').create({
                    chat_id: chat_id,
                    chat_name: chat_name,
                    is_store_chat: false,
                });
            }
            logger.info(group_record);

            const button_url = generateCardButtonUrl(context, chat_id, group_record._id);

            // 消息卡片的发送必须是 stringify 之后的数据
            const card_message =
                '{"config":{"wide_screen_mode":true},"elements":[{"tag":"markdown","content":"为了更好地服务大家，请将一店一群机器人设为群管理员。"},{"tag":"action","actions":[{"tag":"button","text":{"tag":"plain_text","content":"点击授权"},"type":"primary","multi_url":{"url":"baidu.com","pc_url":"","android_url":"","ios_url":""}}]}],"header":{"template":"red","title":{"content":"🤖 一店一群机器人授权","tag":"plain_text"}}}';
            logger.info('获取到的卡片消息', card_message);
            let message = JSON.parse(card_message);
            message.elements[1].actions[0].multi_url.url = button_url;
            message = JSON.stringify(message);

            logger.info('chat_id:', chat_id);
            logger.info('button_url:', button_url);
            logger.info('message:', JSON.stringify(message, null, 4));

            let response = await client.im.message.create({
                params: {
                    receive_id_type: 'chat_id',
                },
                data: {
                    receive_id: chat_id,
                    msg_type: 'interactive',
                    content: message,
                },
            });
            logger.info(response);

            if (response?.code !== 0) {
                logger.info(response);
                logger.error('发送消息失败');
                return {
                    code: 400,
                    msg: '发送消息失败',
                };
            }

            break;

        case 'card.action.trigger':
            // card.action.trigger 消息卡片按钮被点击事件
            logger.info('本次事件：用户点击消息卡片按钮');
            break;

        case 'im.message.receive_v1':
            
            // im.message.receive_v1 消息接收事件，群聊中的 at 或者用户的私聊
            logger.info('本次事件：用户向机器人发送消息事件');
            break;

        case 'contact.user.updated_v3':

            // contact.user.updated_v3 用户信息更新事件
            logger.info('本次事件：用户信息更新事件');
            await faas.function("UserInfoChangeEvent").invoke(params);
            break;

        default:
            logger.error('未知的事件类型，请检查');
            return {
                code: 400,
                msg: '未知的事件类型，请检查',
            };
    }
};

/**
 * @description 生成机器人进群消息卡片按钮的 URL
 * @param {} context
 * @param {*} chat_id
 * @returns
 */
function generateCardButtonUrl(context, chat_id, group_id) {
    const SCOPE = 'im:chat';
    const STATE = `setgroupadmin_user`;

    let APPID = '';
    let BASE_URL = '';

    if (context.tenant.type === 4) {
        // 开发环境
        APPID = 'cli_a69253f101b1500b';
        BASE_URL = 'https%3A%2F%2Ffeishu-dev29.aedev.feishuapp.cn%2Fae%2Fapps%2Fone_store__c%2Faadgdtfskbqhi';
    } else {
        // 线上环境
        APPID = 'cli_a69e4611e1f8d00b';
        BASE_URL = 'https%3A%2F%2Ffeishu.feishuapp.cn%2Fae%2Fapps%2Fone_store__c%2Faadgdtfskbqhi';
    }

    const REDIRECT_URI = `${BASE_URL}%3Fparams_var_RDE3AgWC%3D${chat_id}%26params_var_QrP6EhWe%3D${group_id}`;
    // %3Fparams_var_RDE3AgWC%3Doc_34e76ae070db2034746777a762f86439%26params_var_QrP6EhWe%3D1796560404246715

    return `https://open.feishu.cn/open-apis/authen/v1/authorize?app_id=${APPID}&redirect_uri=${REDIRECT_URI}&scope=${SCOPE}&state=${STATE}`;
}
