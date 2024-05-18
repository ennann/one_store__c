// 通过 NPM dependencies 成功安装 NPM 包后此处可引入使用
// 如安装 linq 包后就可以引入并使用这个包
// const linq = require("linq");

const dayjs = require("dayjs");
const {newLarkClient, createLimiter} = require("../utils");
const _ = application.operator;
/**
 * @param {Params}  params     自定义参数
 * @param {Context} context    上下文参数，可通过此参数下钻获取上下文变量信息等
 * @param {Logger}  logger     日志记录器
 *
 * @return 函数的返回数据
 */
module.exports = async function (params, context, logger) {
    // 日志功能
    logger.info(`${new Date()} 【任务】任务创建重试`);

    //任务处理记录
    const {object_task_create_monitor} = params;
    if (!object_task_create_monitor) {
        return {code: -1, message: "未传入有效的任务处理记录"}
    }
    const client = await newLarkClient({userId: context.user._id}, logger);

    //任务定义 
    const object_task_def = await application.data.object("object_task_def")
        .select('_id',
            'name', //任务名称
            'task_number', //任务编码
            'description', //任务描述
            'task_tag', //任务分类（对象）
            'option_method', //任务周期（全局选项）：计划任务：option_01，一次性任务：option_02
            'option_time_cycle', //任务定义（全局选项）：天:option_day，周:option_week，月:option_month，季度:option_quarter，半年:option_half_year，年:option_year
            'repetition_rate', //重复频率
            'boolean_public_now', //是否立即发布
            'datetime_publish', //发布时间
            'datetime_start', //开始时间
            'datetime_end', //结束时间
            'deal_duration', //任务处理时长
            'option_status', //状态（全局选项）：新建:option_01，启用:option_02，禁用:option_03
            'send_channel', //发送渠道（全局选项）：发送到飞书群:option_group，发送到个人:option_user
            'option_handler_type', //任务处理人类型（全局选项）：飞书群:option_01，责任人：option_02
            'chat_rule', //群组筛选规则（对象）
            'user_rule', //人员筛选规则（对象）
            'carbon_copy', //任务抄送人（对象）
            'option_is_check', //任务是否需要验收(全局选项)：是：option_yes，否：option_no
            'check_flow', //任务验收流程(对象)
            'task_publisher', //发布人（对象）
            'publish_department', //发布人所属部门(对象)
            'option_priority', //优先级(全局选项)：高:option_01，中:option_02，低:option_03
            'option_upload_image', //任务要求上传图片
            'option_input_information', //任务要求录入完成信息
            'option_upload_attachement', //任务要求上传附件
            'is_workday_support', //是否支持工作日历 布尔
            'warning_time', //设置预警时间（小时）
            'set_warning_time' //设置任务到期前提醒
            )
        .where({_id: object_task_create_monitor.task_def._id}).findOne();
    // task 代表任务处理记录
    const createDatas = [];
    let task_plan_time = dayjs(object_task_def.datetime_start).add(Number.parseInt(object_task_def.deal_duration), 'day').valueOf();
    //飞书群
    if (object_task_def.option_handler_type === "option_01") {
        //群组赛选规则
        const chatRecordList = await faas.function('DeployChatRange').invoke({deploy_rule: object_task_def.chat_rule});
        logger.info(`群组筛选规则[${object_task_def.chat_rule._id}]返回群数量->`, chatRecordList.length)
        for (const chatRecordListElement of chatRecordList) {
            const createData = {
                name: object_task_def.name,
                description: object_task_def.description,
                task_def: {_id: object_task_def._id}, //任务定义
                task_monitor: {_id: object_task_create_monitor._id}, //任务创建记录
                task_status: "option_pending",
                //其他字段
                task_create_time: object_task_create_monitor.task_create_time, //任务创建时间
                task_plan_time: task_plan_time,  //要求完成时间 ===  开始时间 + 任务处理时长
                is_overdue: "option_no",  //是否超期
                option_upload_imagede: object_task_def.option_upload_image,  //任务要求上传图片
                option_input_informationdd: object_task_def.option_input_information,  //任务要求录入完成信息
                option_upload_attachementdd: object_task_def.option_upload_attachement,  //任务要求上传附件
                set_warning_time: object_task_def.set_warning_time,  //是否设置任务到期前提醒
                warning_time: object_task_def.warning_time,  //预警时间（小时）
                source_department: {
                    _id: object_task_def.publish_department._id,
                    name: object_task_def.publish_department.name
                },//任务来源
                option_priority: object_task_def.option_priority,//优先级
            };
            //为任务处理记录创建门店普通任务
            createData.task_chat = {_id: chatRecordListElement._id}; //负责群
            //查询飞书群所在部门
            const feishu_chat = await application.data.object("object_feishu_chat")
                .select("_id", "department").where({_id: chatRecordListElement._id}).findOne();
            createData.deal_department = {_id: feishu_chat.department._id} //任务所属部门
            createDatas.push(createData);
        }
    } else if (object_task_def.option_handler_type === "option_02") {
        //人员塞选规则
        const userList = await faas.function('DeployMemberRange').invoke({user_rule: object_task_def.user_rule});
        logger.info(`人员筛选规则[${object_task_def.user_rule._id}]返回人员数量->`, userList.length)
        for (const userListElement of userList) {
            const createData = {
                name: object_task_def.name,
                description: object_task_def.description,
                task_def: {_id: object_task_def._id}, //任务定义
                task_monitor: {_id: object_task_create_monitor._id}, //任务创建记录
                task_status: "option_pending",
                //其他字段
                task_create_time: object_task_create_monitor.task_create_time, //任务创建时间
                task_plan_time: task_plan_time,  //要求完成时间 ===  开始时间 + 任务处理时长
                is_overdue: "option_no",  //是否超期
                option_upload_imagede: object_task_def.option_upload_image,  //任务要求上传图片
                option_input_informationdd: object_task_def.option_input_information,  //任务要求录入完成信息
                option_upload_attachementdd: object_task_def.option_upload_attachement,  //任务要求上传附件
                set_warning_time: object_task_def.set_warning_time,  //是否设置任务到期前提醒
                warning_time: object_task_def.warning_time,  //预警时间（小时）
                source_department: {
                    _id: object_task_def.publish_department._id,
                    name: object_task_def.publish_department.name
                },//任务来源
                option_priority: object_task_def.option_priority,//优先级
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
    logger.info(`需要为任务处理记录[${object_task_create_monitor._id}]创建的门店普通任务数量->`, createDatas.length);

    if (createDatas.length > 0) {
        const storeTaskCreateResults = await Promise.all(createDatas.map(object_store_task => createStoreTaskEntryStart(object_task_def,object_store_task, logger, client)));
        const successfulStoreTasks = storeTaskCreateResults.filter(result => result.code === 0);
        const failedStoreTasks = storeTaskCreateResults.filter(result => result.code !== 0);
        logger.info(`为任务处理记录[${object_task_create_monitor._id}]创建门店普通任务成功数量: ${successfulStoreTasks.length}, 失败数量: ${failedStoreTasks.length}`);
        const messageCardSendDatas = [];
        storeTaskCreateResults.forEach(item => {
            if (item.messageCardSendData) {
                messageCardSendDatas.push({
                    sendMessages: item.messageCardSendData,
                    storeTaskId: item.storeTaskId
                });
            }
        });
        //创建限流器
        const limitedsendFeishuMessage = createLimiter(sendFeishuMessage);
        //发送飞书卡片消息
        logger.info(`根据门店普通任务创建记录需要发送飞书数量---->${messageCardSendDatas.length}`)
        const sendFeishuMessageResults = await Promise.all(messageCardSendDatas.map(messageCardSendData => limitedsendFeishuMessage(messageCardSendData)));

        const sendFeishuMessageSuccess = sendFeishuMessageResults.filter(result => result.code === 0);
        const sendFeishuMessageFail = sendFeishuMessageResults.filter(result => result.code !== 0);
        logger.info(`根据门店普通任务创建记录发送飞书消息成功数量: ${sendFeishuMessageSuccess.length}, 失败数量: ${sendFeishuMessageFail.length}`);

        //修改任务处理记录状态为处理中 =>全部成功
        if (failedStoreTasks.length === 0) {
            try {
                const updataData = {
                    _id: object_task_create_monitor._id,
                    option_status: "option_05"
                }
                await application.data.object("object_task_create_monitor").update(updataData);
            } catch (error) {
                logger.error(`修改任务处理记录[${object_task_create_monitor._id}]状态为处理中失败-->`, error);
            }
        }
        return {
            code: successfulStoreTasks.length > 0 ? 0 : -1,
            message: '任务创建重试完成',
            data: {
                success_count: successfulStoreTasks.length,
                success_list: successfulStoreTasks,
                failed_count: failedStoreTasks.length,
                failed_list: failedStoreTasks,
            },
        }
    } else {
        logger.warn("根据任务定义群组和人员筛选规则查询结果为空");
        return {
            code: -1,
            message: '任务创建重试完成[根据任务定义群组和人员筛选规则查询结果为空]',
            data: {
                success_count: 0,
                success_list: [],
                failed_count: 0,
                failed_list: [],
            },
        }
    }
}

async function createStoreTaskEntryStart(object_task_def,object_store_task, logger, client) {
    try {
        //判断是否发送成功者，发送成功者不再发送
        const object_store_task_out = await application.data.object("object_store_task")
            .select("_id")
            .where(
                _.or(
                    _.and({
                        task_monitor: object_store_task.task_monitor._id,
                        task_chat: object_store_task.task_chat._id
                    }),
                    _.and({
                        task_monitor: object_store_task.task_monitor._id,
                        task_handler: object_store_task.task_handler._id
                    }),
                )
            ).findOne();
        let storeTaskId = "";
        if (!object_store_task_out) {
            const storeTask = await application.data.object('object_store_task').create(object_store_task);
            storeTaskId = storeTask._id;
            // await faas.function('CreateFsTask').invoke({ storeTaskId: storeTask._id });
        } else {
            storeTaskId = object_store_task._id;
        }
        const data = {
            receive_id_type: "", //接收方类型：open_id/user_id/union_id/email/chat_id text
            msg_type: "interactive", //消息类型：text、post、image、file、audio、media、sticker、interactive、share_chat、share_user text
            receive_id: "", //接收方ID text
            content: "", //消息卡片内容  JSON
        }
        // 发送消息卡片
        try {
            let priority = await faas.function("GetOptionName").invoke({
                table_name: "object_store_task",
                option_type: "option_priority",
                option_api: object_store_task.option_priority
            });
            let url = "";
            //判断执行流程的url
            if (object_task_def.option_upload_image === "option_yes" ||
                object_task_def.option_input_information === "option_yes" ||
                object_task_def.option_upload_attachement === "option_yes" ){
                url = `https://applink.feishu.cn/client/web_app/open?mode=sidebar&appId=cli_a6b23873d463100b&path=/ae/user/pc/one_store__c/system_page/action&1=1&objectApiName2RecordIds%5Bone_store__c__object_aadgfx2qchmdi%5D%5B0%5D=${storeTaskId}&1=1&version=v2&actionApiName=automation_0e8567ea5a4&namespace=one_store__c&recordID=`;
            }else{
                url = `https://applink.feishu.cn/client/web_app/open?mode=sidebar&appId=cli_a6b23873d463100b&path=/ae/user/pc/one_store__c/system_page/action&1=1&variables%5B0%5D%5BvarApiName%5D=customizeInput__original__717a10b5&variables%5B0%5D%5BinputValue%5D=${storeTaskId}&1=1&actionApiName=automation_952bc370750&namespace=one_store__c&recordID=&version=v2`;
            }
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
                            "content": "任务来源：" + object_store_task.source_department.name,
                            "tag": "plain_text"
                        }
                    },
                    {
                        "tag": "div",
                        "text": {
                            "content": "任务下发时间：" + dayjs(object_store_task.task_create_time).format('YYYY-MM-DD HH:mm:ss'),
                            "tag": "plain_text"
                        }
                    },
                    {
                        "tag": "div",
                        "text": {
                            "content": "距离截至时间还有" + Number.parseFloat(object_store_task.deadline_time).toFixed(2) + "小时",
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
                                    "content": "完成任务"
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
                        "content": "【任务发布】有一条" + object_store_task.name + "门店任务请尽快处理！",
                        "tag": "plain_text"
                    }
                }
            }
            data.content = JSON.stringify(content);
            if (object_store_task.task_chat) {

                //获取群组ID
                const feishuChat = await application.data.object('object_feishu_chat')
                    .select('_id', 'chat_id')
                    .where({_id: object_store_task.task_chat._id || object_store_task.task_chat.id}).findOne();

                data.receive_id_type = "chat_id"
                data.receive_id = feishuChat.chat_id
            } else {
                //通过用户
                let feishuPeople = await application.data.object("_user")
                    .select("_id", "_department","_lark_user_id")
                    .where({_id: object_store_task.task_handler._id || object_store_task.task_handler.id}).findOne();
                // 判断是群组发送（查询所在部门的门店群）还是机器人（机器人直发）发送
                let object_task_def = await application.data.object("object_task_def")
                    .select("_id", "send_channel")
                    .where({_id: object_store_task.task_def._id || object_store_task.task_def.id}).findOne();

                if (object_task_def.send_channel === "option_group") {
                    data.receive_id_type = "chat_id"
                    //通过部门ID获取飞书群ID
                    let object_feishu_chat = await application.data.object("object_feishu_chat")
                        .select("_id", "chat_id")
                        .where({department: feishuPeople._department._id || feishuPeople._department.id}).findOne();
                    data.receive_id = object_feishu_chat.chat_id
                } else {
                    data.receive_id_type = "user_id"
                        data.receive_id = feishuPeople._lark_user_id;
                        content.header.title.content = "【任务发布】" + feishuPeople._name.find(item => item.language_code === 2052).text + "有一条" + object_store_task.name + "门店任务请尽快处理！";
                        data.content = JSON.stringify(content);
                }
            }

            return {code: 0, message: '创建门店普通任务成功', storeTaskId: storeTaskId, messageCardSendData: data};

        } catch (error) {

            logger.error(`组装门店普通任务[${object_store_task._id}]发送消息卡片失败-->`, error);

            return {
                code: 0,
                message: `创建门店普通任务成功&组装门店普通任务[${object_store_task._id}]发送消息卡片失败`,
                storeTaskId: storeTaskId,
                messageCardSendData: {}
            };
        }
    } catch (error) {

        logger.error(`创建门店普通任务失败-->`, error);
        return {code: -1, message: '创建门店普通任务失败：' + error, task: object_store_task};
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
