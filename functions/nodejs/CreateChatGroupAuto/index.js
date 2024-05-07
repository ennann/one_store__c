// 通过 NPM dependencies 成功安装 NPM 包后此处可引入使用
// 如安装 linq 包后就可以引入并使用这个包
// const linq = require("linq");
const {newLarkClient, batchOperation} = require('../utils');
const {convertRecordsToGroupMenu} = require("../GroupMenuUtils/groupMenuConstructor");
/**
 * @param {Params}  params     自定义参数
 * @param {Context} context    上下文参数，可通过此参数下钻获取上下文变量信息等
 * @param {Logger}  logger     日志记录器
 *
 * @return 函数的返回数据
 */
module.exports = async function (params, context, logger) {
    // 日志功能
    logger.info(`${new Date()} 创建群后函数开始执行`);
    const {feishu_chat} = params;
    const feishu_chat_id = feishu_chat.chat_id;
    const feishuId = feishu_chat._id;

    const client = await newLarkClient({userId: context.user._id}, logger);

    // 获取群机器人
    const feishu_bots = await application.data.object('object_chat_bot').select('chat_rule', 'bot_app_id', '_id').find();
    logger.info("群机器人记录：" +  JSON.stringify(feishu_bots, null, 2));
    for (const feishuBot of feishu_bots) {
        const bot_app_id = feishuBot.bot_app_id;
        const feishuBotId = feishuBot._id;
        logger.info("群机器人详情--->" +  JSON.stringify(feishuBot.chat_rule, null, 2));
        if (feishuBot.chat_rule == null) {
            continue;
        }
        // 调用函数获取群机器人的群聊ID列表
        const chatRecordList = await faas.function('DeployChatRange').invoke({deploy_rule: feishuBot.chat_rule});
        const chatIdList = chatRecordList.map(item => item.chat_id);
        logger.info('根据规则获取到的群ID列表为', JSON.stringify(chatIdList, null, 2));
        for (const chatRecord of chatRecordList) {
            for (const chatR of chatRecord) {
                const chat_id = chatR.chat_id;
                if (chat_id === feishu_chat_id) {
                    //将机器人入群
                    try {
                        const response = await client.im.chatMembers.create({
                            path: {chat_id},
                            params: {
                                member_id_type: 'app_id',
                                succeed_type: 0,
                            },
                            data: {
                                id_list: [bot_app_id],
                            },
                        });

                        if (response.code !== 0) {
                            logger.error(`机器人 ${feishuBot_bot_app_id} 加入群聊 ${chat_id} 失败，错误信息：${response.msg}`)
                        }
                        logger.info('机器人加入群聊成功')

                      //存储apaas数据]
                      const batchCreateData = [];
                      batchCreateData.push({
                      union_id: `${bot_app_id}-${chat_id}`,
                      bot: {_id: feishuBotId},
                      chat: {_id: feishuId},
                      })
                      // 创建一个函数，机器人和群的关系
                      const createBotChatRelation = async (data) => {
                      try {
                          await application.data.object('object_chat_bot_relation').create(data);
                          logger.info('创建机器人和群的关系成功');
                      } catch (error) {
                          logger.error('创建机器人和群的关系失败：' + error.message);
                      }
                      }
                      // 并行执行创建关系的操作
                      const createRelationResults = await Promise.all(batchCreateData.map(data => createBotChatRelation(data)));
                      logger.info('创建机器人和群的关系结果', JSON.stringify(createRelationResults, null, 2));

                    } catch (error) {
                        logger.error('机器人加入群聊失败：' + error.message);
                    }
                }
            }
        }
    }
    // 获取群置顶
    const feishu_pins = await application.data.object('object_chat_pin').select('pin_name', 'pin_url', 'chat_rule', '_id').find();
    logger.info("群置顶记录：" + JSON.stringify(feishu_pins, null, 2));

    for (const feishu_pin of feishu_pins) {
        const feishuPinsId = feishu_pin._id;
        console.info("群置顶规则详情--->" + JSON.stringify(feishu_pin.chat_rule, null, 2));
        if (feishu_pin.chat_rule == null) {
            continue;
        }
        //获取符合规则的群列表
        const chatRecordList = await faas.function('DeployChatRange').invoke({deploy_rule: feishu_pin.chat_rule});
        for (const chatRecord of chatRecordList) {
            for (const chatR of chatRecord) {
                const chat_id = chatR.chat_id;
                if (chat_id === feishu_chat_id) {
                    try {
                        let image_key = null;
                        // // 处理图标上传
                        // const file = await application.resources.file.download(feishu_pin.pin_icon);
                        // 
                        // const image_key_res = await client.im.image.create({
                        //     data: {
                        //         image_type: 'message',
                        //         image: file,
                        //     },
                        // });
                        // 
                        // if (image_key_res.code === 0) {
                        //     image_key = image_key_res.image_key;
                        // }

                        const group_tab_res = await client.im.chatTab.create({
                            path: {chat_id},
                            data: {
                                chat_tabs: [
                                    {
                                        tab_name: feishu_pin.pin_name,
                                        tab_type: 'url',
                                        tab_content: {url: feishu_pin.pin_url},
                                        tab_config: {icon_key: image_key, is_built_in: false},
                                    },
                                ],
                            },
                        });

                        if (group_tab_res.code !== 0) {
                            logger.error('群置顶创建失败：' + group_tab_res.message);
                        }
                        logger.info('群置顶创建成功');

                        //存储apaas数据
                        const batchCreateData = [];
                        batchCreateData.push({
                            union_id: `${feishu_pin.pin_name}-${feishu_pin._id}-${chat_id}`,
                            chat_pin: {_id: feishu_pin._id},
                            chat: {_id: chat_id},
                        })
                        // 创建一个函数，机器人和群的关系
                        const createBotChatRelation = async (data) => {
                            try {
                                await application.data.object('object_chat_pin_relation').create(data);
                                logger.info('创建群置顶和群的关系成功');
                            } catch (error) {
                                logger.error('创建群置顶和群的关系失败：' + error.message);
                            }
                        }
                        // 并行执行创建关系的操作
                        const createRelationResults = await Promise.all(batchCreateData.map(data => createBotChatRelation(data)));
                        logger.info('创建群置顶和群的关系结果', JSON.stringify(createRelationResults, null, 2));
                    } catch (error) {
                        logger.error('群置顶创建失败：' + error.message);
                    }
                }
            }
        }

    }
    // 获取群菜单分类
    const feishu_chat_menu_catalogs = await application.data.object('object_chat_menu_catalog').select('name', 'description', 'chat_rule', '_id').find();
    logger.info("群菜单分类记录："  + JSON.stringify(feishu_chat_menu_catalogs, null, 2));
    for (const feishu_chat_menu_catalog of feishu_chat_menu_catalogs) {
        const feishu_chat_menu_catalog_id = feishu_chat_menu_catalog._id;
        console.info("群菜单规则详情--->" + feishu_chat_menu_catalog.chat_rule);
        if (feishu_chat_menu_catalog.chat_rule == null) {
            continue;
        }
        //获取符合规则的群列表
        const chatRecordList = await faas.function('DeployChatRange').invoke({deploy_rule: feishu_chat_menu_catalog.chat_rule});
        for (const chatRecord of chatRecordList) {
            for (const chatR of chatRecord) {
                const chat_id = chatR.chat_id;
                if (chat_id === feishu_chat_id) {
                    const chatMenuRecordsPromise = application.data
                        .object('object_chat_menu')
                        .select(['_id', 'menu_catalog', 'name', 'menu_link', 'mobile_link', 'parent_menu'])
                        .where({menu_catalog: feishu_chat_menu_catalog_id})
                        .find();

                    // 获取分配的群聊列表和需要分配的菜单数据
                    const [chatMenuRecords] = await Promise.all([chatMenuRecordsPromise]);
                    const chatIdList = [];
                    logger.info('查询到的群聊列表', JSON.stringify(chatIdList, null, 2));
                    logger.info('查询到的菜单数据', JSON.stringify(chatMenuRecords, null, 2));

                    const menu_data = convertRecordsToGroupMenu(chatMenuRecords); // 在循环内部消费 menu_data，所以这里不需要深拷贝
                    logger.info('转换后的菜单数据', JSON.stringify(menu_data, null, 2));

                    let batchUpdateData = [];
                    // 因为在循环内，调用太多次 logger 会导致日志过多，所以这里使用一个变量来记录日志，最后一次性输出，一个循环一个日志
                    let loop_logs = `==> 开始处理群聊 ${chat_id}\n`;

                    try {
                        // 1. 先获取群的菜单
                        let current_chat_menu = await faas.function('GroupMenuFetch').invoke({chat_id});
                        loop_logs += `==> 获取群功能菜单结果：${JSON.stringify(current_chat_menu)}\n`;

                        if (current_chat_menu?.code === 0 && current_chat_menu?.data.menu_tree?.chat_menu_top_levels.length === 0) {
                            //当前群没有菜单，可以创建
                            loop_logs += '==> 当前群没有菜单，可以创建\n';
                        } else {
                            // 当前群已有菜单，需要先对菜单进行清空
                            loop_logs += '==> 当前群已有菜单，需要先对菜单进行清空删除\n';
                            let chat_menu = current_chat_menu.data;
                            let delete_res = await faas.function('GroupMenuDelete').invoke({chat_id, chat_menu});
                            loop_logs += `==> 删除群功能菜单结果：${JSON.stringify(delete_res)}\n`;
                        }

                        // 2. 创建群功能菜单
                        let menu_res = await faas.function('GroupMenuCreate').invoke({chat_id, menu_data});
                        loop_logs += `==> 创建群功能菜单结果：${JSON.stringify(menu_res)}\n`;

                        batchUpdateData.push({
                            _id: chat_id,
                            chat_catalog: {_id: feishu_chat_menu_catalog_id},
                        });
                        logger.info(loop_logs);

                        logger.info('群置顶分发完成，批量更新数据数量为 batchUpdateData ', batchUpdateData.length);
                        logger.info(JSON.stringify(batchUpdateData, null, 2));
    
                        // // 开始批量创建数据
                        if (batchUpdateData.length > 0) {
                            await batchOperation(logger, "object_feishu_chat", "batchUpdate", batchUpdateData);
                            logger.info('批量创建群置顶关系数据完成');
                        }

                    } catch (error) {
                        loop_logs += `==> 群功能菜单创建失败，原因：${error.message}\n`;
                        logger.error(loop_logs);
                        fail_chat_id_list.push({
                            chat_id,
                            reason: error.message || '未知错误',
                        });
                    }
                }
            }
        }
    }
}
