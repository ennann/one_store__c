// 通过 NPM dependencies 成功安装 NPM 包后此处可引入使用
// 如安装 linq 包后就可以引入并使用这个包
// const linq = require("linq");

const dayjs = require("dayjs");
const {newLarkClient} = require("../utils");
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
    const {object_task_create_monitor} = params;
    if (!object_task_create_monitor){
        return {code:-1,message:""}
    }
    const client = await newLarkClient({userId: context.user._id}, logger);
    //任务处理记录
    const task = object_task_create_monitor;
    //任务定义 TODO 查询
    const item = {};
    // task 代表任务处理记录
    const createDatas = [];
    try {
        let task_plan_time = dayjs(item.datetime_start).add(item.deal_duration, 'day').valueOf();
        //飞书群
        if (item.option_handler_type === "option_01") {
            //群组赛选规则
            const chatRecordList = await faas.function('DeployChatRange').invoke({deploy_rule: item.chat_rule});
            logger.info(`群组筛选规则[${item.chat_rule._id}]返回群数量->`, chatRecordList.length)
            for (const chatRecordListElement of chatRecordList) {
                const createData = {
                    name: item.name,
                    description: item.description,
                    task_def: {_id: item._id}, //任务定义
                    task_monitor: {_id: task._id}, //任务创建记录
                    task_status: "option_pending",
                    //其他字段
                    task_create_time: task.task_create_time, //任务创建时间
                    task_plan_time: task_plan_time,  //要求完成时间 ===  开始时间 + 任务处理时长
                    is_overdue: "option_no",  //是否超期
                    option_upload_imagede: item.option_upload_image,  //任务要求上传图片
                    option_input_informationdd: item.option_input_information,  //任务要求录入完成信息
                    option_upload_attachementdd: item.option_upload_attachement,  //任务要求上传附件
                    set_warning_time: item.set_warning_time,  //是否设置任务到期前提醒
                    warning_time: item.warning_time,  //预警时间（小时）
                    source_department: {_id: item.publish_department._id, name: item.publish_department.name},//任务来源
                    option_priority: item.option_priority,//优先级
                };
                logger.info(`群组筛选规则[${item.chat_rule._id}]返回群记录详情->`, chatRecordListElement)
                //为任务处理记录创建门店普通任务
                createData.task_chat = {_id: chatRecordListElement._id}; //负责群
                //查询飞书群所在部门
                const feishu_chat = await application.data.object("object_feishu_chat")
                    .select("_id", "department").where({_id: chatRecordListElement._id}).findOne();
                createData.deal_department = {_id: feishu_chat.department._id} //任务所属部门
                createDatas.push(createData);
            }
        } else if (item.option_handler_type === "option_02") {
            //人员塞选规则
            const userList = await faas.function('DeployMemberRange').invoke({user_rule: item.user_rule});
            logger.info(`人员筛选规则[${item.user_rule._id}]返回人员数量->`, userList.length)
            for (const userListElement of userList) {
                const createData = {
                    name: item.name,
                    description: item.description,
                    task_def: {_id: item._id}, //任务定义
                    task_monitor: {_id: task._id}, //任务创建记录
                    task_status: "option_pending",
                    //其他字段
                    task_create_time: task.task_create_time, //任务创建时间
                    task_plan_time: task_plan_time,  //要求完成时间 ===  开始时间 + 任务处理时长
                    is_overdue: "option_no",  //是否超期
                    option_upload_imagede: item.option_upload_image,  //任务要求上传图片
                    option_input_informationdd: item.option_input_information,  //任务要求录入完成信息
                    option_upload_attachementdd: item.option_upload_attachement,  //任务要求上传附件
                    set_warning_time: item.set_warning_time,  //是否设置任务到期前提醒
                    warning_time: item.warning_time,  //预警时间（小时）
                    source_department: {_id: item.publish_department._id, name: item.publish_department.name},//任务来源
                    option_priority: item.option_priority,//优先级
                };
                //为任务处理记录创建门店普通任务
                createData.task_handler = {_id: userListElement._id}; //负责人
                //查询人员所在部门
                const user = await application.data.object("_user")
                    .select("_id", "_department").where({_id: userListElement._id}).findOne();
                createData.deal_department = {_id: user._department._id} //任务所属部门
                createDatas.push(createData);
            }
        }
        logger.info(`需要为任务处理记录[${task._id}]创建的门店普通任务数量->`, createDatas.length);

        if (createDatas.length > 0) {
            const storeTaskCreateResults = await Promise.all(createDatas.map(task => createStoreTaskEntryStart(task, logger, client)));
            const successfulStoreTasks = storeTaskCreateResults.filter(result => result.code === 0);
            const failedStoreTasks = storeTaskCreateResults.filter(result => result.code !== 0);
            logger.info(`为任务处理记录[${task._id}]创建门店普通任务成功数量: ${successfulStoreTasks.length}, 失败数量: ${failedStoreTasks.length}`);
            const messageCardSendDatas = [];
            storeTaskCreateResults.forEach(item => {
                messageCardSendDatas.push({
                    sendMessages: item.messageCardSendData,
                    storeTaskId: item.storeTaskId
                });
            });
            //创建限流器
            const limitedsendFeishuMessage = createLimiter(sendFeishuMessage);
            //发送飞书卡片消息
            logger.info(`根据门店普通任务创建记录需要发送飞书数量---->${messageCardSendDatas.length}`)
            const sendFeishuMessageResults = await Promise.all(messageCardSendDatas.map(messageCardSendData => limitedsendFeishuMessage(messageCardSendData)));

            const sendFeishuMessageSuccess = sendFeishuMessageResults.filter(result => result.code === 0);
            const sendFeishuMessageFail = sendFeishuMessageResults.filter(result => result.code !== 0);
            logger.info(`根据门店普通任务创建记录发送飞书消息成功数量: ${sendFeishuMessageSuccess.length}, 失败数量: ${sendFeishuMessageFail.length}`);

            //修改任务处理记录状态为处理中
            try {
                const updataData = {
                    _id: task._id,
                    option_status: "option_05"
                }
                await application.data.object("object_task_create_monitor").update(updataData);
            } catch (error) {
                logger.error(`修改任务处理记录[${task._id}]状态为处理中失败-->`, error);
            }
        } else {
            logger.warn("根据任务定义群组和人员筛选规则查询结果为空");
            try {
                const updataData = {
                    _id: task._id,
                    option_status: "option_03"
                }
                await application.data.object("object_task_create_monitor").update(updataData);
            } catch (error) {
                logger.error(`修改任务处理记录[${task._id}]状态为失败失败-->`, error);
            }
        }
        return {code: 0, message: '为任务处理记录创建门店普通任务成功', task_id: task._id};
    } catch (error) {
        logger.error(`为任务处理[${task._id}]记录创建门店普通任务失败-->`, error);
        //修改任务处理记录状态为失败
        try {
            const updataData = {
                _id: task._id,
                option_status: "option_03"
            }
            await application.data.object("object_task_create_monitor").update(updataData);
        } catch (error) {
            logger.error(`修改任务处理记录[${task._id}]状态为失败失败-->`, error);
        }
        return {code: -1, message: error.message, task_id: task._id};
    }
}


async function createStoreTaskEntryStart(task, logger, client) {
    // task 代表门店普通任务
    try {
        logger.info("task--->", task);
        const storeTaskId = await application.data.object('object_store_task').create(task);
        // await faas.function('CreateFsTask').invoke({ storeTaskId: storeTaskId._id });
        const data = {
            receive_id_type: "", //接收方类型：open_id/user_id/union_id/email/chat_id text
            msg_type: "interactive", //消息类型：text、post、image、file、audio、media、sticker、interactive、share_chat、share_user text
            receive_id: "", //接收方ID text
            content: "", //消息卡片内容  JSON
        }
        // 发送消息卡片
        // todo: 补充消息卡片内的按钮
        try {
            let name = task.name;
            let priority = await faas.function("GetOptionName").invoke({
                table_name: "object_store_task",
                option_type: "option_priority",
                option_api: task.option_priority
            });
            let url = await application.globalVar.getVar("task_click_url");
            const content = {
                "config": {
                    "wide_screen_mode": true
                },
                "elements": [
                    {
                        "tag": "div",
                        "text": {
                            "content": "任务优先级：" + priority.option_name,
                            "tag": "plain_text"
                        }
                    },
                    {
                        "tag": "div",
                        "text": {
                            "content": "任务来源：" + task.source_department.name,
                            "tag": "plain_text"
                        }
                    },
                    {
                        "tag": "div",
                        "text": {
                            "content": "任务下发时间：" + dayjs(task.task_create_time).format('YYYY-MM-DD HH:mm:ss'),
                            "tag": "plain_text"
                        }
                    },
                    {
                        "tag": "div",
                        "text": {
                            "content": "距离截至时间还有" + task.deadline_time.toFixed(2) + "小时",
                            "tag": "plain_text"
                        }
                    },
                    {
                        "tag": "hr"
                    },
                    {
                        "tag": "action",
                        "actions": [
                            {
                                "tag": "button",
                                "text": {
                                    "tag": "plain_text",
                                    "content": "百度一下"
                                },
                                "url": url,
                                "type": "primary"
                            }
                        ]
                    }
                ],
                "header": {
                    "template": "turquoise",
                    "title": {
                        "content": "【任务发布】有一条" + name + "门店任务请尽快处理！",
                        "tag": "plain_text"
                    }
                }
            }

            data.content = JSON.stringify(content);
            if (task.task_chat) {
                // logger.info("发送到群里----->",JSON.stringify(task.task_chat,null,2));
                //获取群组ID
                const feishuChat = await application.data.object('object_feishu_chat')
                    .select('_id', 'chat_id')
                    .where({_id: task.task_chat._id || task.task_chat.id}).findOne();
                data.receive_id_type = "chat_id"
                data.receive_id = feishuChat.chat_id
            } else {
                // logger.info("发送到人员----->",JSON.stringify(task.task_handler,null,2));
                // 判断是群组发送（查询所在部门的门店群）还是机器人（机器人直发）发送

                let object_task_def = await application.data.object("object_task_def")
                    .select("_id", "send_channel")
                    .where({_id: task.task_def._id || task.task_def.id}).findOne();
                // logger.info("发送到人员[object_task_def]----->",JSON.stringify(object_task_def,null,2));
                if (object_task_def.send_channel === "option_group") {
                    // logger.info("通过群组发送----->");
                    data.receive_id_type = "chat_id"
                    //获取部门，通过用户
                    let user = await application.data.object("_user")
                        .select("_id", "_department")
                        .where({_id: task.task_handler._id || task.task_handler.id}).findOne();
                    // logger.info("通过用户获取部门----->",JSON.stringify(user,null,2));
                    //通过部门ID获取飞书群ID
                    let object_feishu_chat = await application.data.object("object_feishu_chat")
                        .select("_id", "chat_id")
                        .where({department: user._department._id || user._department.id}).findOne();
                    // logger.info("获取部门所在飞书群----->",JSON.stringify(object_feishu_chat,null,2));
                    data.receive_id = object_feishu_chat.chat_id
                } else {
                    // logger.info("通过机器人发送----->");
                    data.receive_id_type = "open_id"
                    const feishuPeople = await application.data.object('_user')
                        .select('_id', '_email', '_name')
                        .where({_id: task.task_handler._id || task.task_handler.id}).findOne();
                    // logger.info("获取用户邮箱----->",JSON.stringify(feishuPeople,null,2));
                    try {
                        const emails = [];
                        emails.push(feishuPeople._email);
                        //获取open_id
                        const res = await client.contact.user.batchGetId({
                            params: {user_id_type: "open_id"},
                            data: {emails: emails}
                        });
                        const user = res.data.user_list.map(item => ({
                            email: item.email,
                            open_id: item.user_id
                        }));
                        // logger.info("通过用户邮箱获取open_id----->",JSON.stringify(user,null,2));
                        data.receive_id = user[0].open_id;
                        content.header.title.content = "【任务发布】" + feishuPeople._name.find(item => item.language_code === 2052).text + "有一条" + task.name + "门店任务请尽快处理！";
                        data.content = JSON.stringify(content);
                    } catch (error) {
                        logger.error(`组装门店普通任务[${task._id}]发送消息卡片失败-->！`, error);
                    }
                }
            }
            // logger.info("messageCardSendData--->",JSON.stringify(data,null,2));
            return {code: 0, message: '创建门店普通任务成功', storeTaskId: storeTaskId._id, messageCardSendData: data};
        } catch (error) {
            logger.error("messageCardSendData--->", JSON.stringify(data, null, 2));
            logger.error(`组装门店普通任务[${task._id}]发送消息卡片失败-->`, error);
            return {
                code: 0,
                message: `创建门店普通任务成功&组装门店普通任务[${task._id}]发送消息卡片失败`,
                storeTaskId: storeTaskId._id,
                messageCardSendData: {}
            };
        }
    } catch (error) {
        logger.error(`创建门店普通任务失败-->`, error);
        return {code: -1, message: '创建门店普通任务失败：' + error, task: task};
    }
}

const sendFeishuMessage = async (messageCardSendData) => {
    try {
        await faas.function('MessageCardSend').invoke(messageCardSendData.sendMessages);
        return {code: 0, message: `[${messageCardSendData.storeTaskId}]飞书消息发送成功`, result: 'success'};
    } catch (error) {
        return {
            code: -1,
            message: `[${messageCardSendData.storeTaskId}]飞书消息发送失败：` + error.message,
            result: 'failed'
        };
    }
};
