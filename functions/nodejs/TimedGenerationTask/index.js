// 通过 NPM dependencies 成功安装 NPM 包后此处可引入使用
// 如安装 linq 包后就可以引入并使用这个包
const dayjs = require("dayjs");
const {createLimiter} = require('../utils');
/**
 * @param {Params}  params     自定义参数
 * @param {Context} context    上下文参数，可通过此参数下钻获取上下文变量信息等
 * @param {Logger}  logger     日志记录器
 *
 * @return 函数的返回数据
 */
module.exports = async function (params, context, logger) {
    // 日志功能
    logger.info(`定时生成任务记录函数开始执行 ${new Date()}`);

    //一次性非立即发布任务
    const query = {
        option_status: "option_02", //启用
    };

    //获取符合条件的任务定义记录列表
    let finalTaskDefList = await fetchTaskDefRecords(query, '一次性非立即发布任务', logger);

    if (finalTaskDefList.length === 0) {
        logger.warn('查询满足条件的一次性非立即发布任务记录为0');
        return {code: -2, message: '未找到有效的任务定义记录'};
    }
    // 为每个任务定义实例记录生成任务批次号并创建任务处理记录
    const taskCreateResults = await Promise.all(finalTaskDefList.map(task => createTaskMonitorEntry(task, logger)));

    const successfulTasks = taskCreateResults.filter(result => result.code === 0);
    const failedTasks = taskCreateResults.filter(result => result.code !== 0);

    logger.info(`成功创建任务处理记录数量: ${successfulTasks.length}, 失败数量: ${failedTasks.length}`);
    //创建门店普通任务
    const finaTaskMonitorEntryList = [];
    for (let i = 0; i < successfulTasks.length; i++) {
        const task_id = successfulTasks[i]?.task_id;
        const query = {
            _id: task_id
        }
        const one = await application.data.object('object_task_create_monitor')
            .select('_id', 'task_def')
            .where(query).findOne();
        finaTaskMonitorEntryList.push(one);
    }
    logger.info(`需要为任务处理记录创建门店普通任务的任务处理记录数量->`, finaTaskMonitorEntryList.length)
    // 为创建任务处理记录创建门店普通任务
    if (finaTaskMonitorEntryList.length > 0) {
        const storeTaskCreateResults = await Promise.all(finaTaskMonitorEntryList.map(task => createStoreTaskEntry(task, logger)));
        const successfulStoreTasks = storeTaskCreateResults.filter(result => result.code === 0);
        const failedStoreTasks = storeTaskCreateResults.filter(result => result.code !== 0);
        logger.info(`成功为任务处理记录创建门店普通任务数量: ${successfulStoreTasks.length}, 失败数量: ${failedStoreTasks.length}`);
    }
    return {
        code: successfulTasks.length > 0 ? 0 : -1,
        message: '任务处理记录生成完成',
        data: {
            successfulTasks: successfulTasks,
            failedTasks: failedTasks,
        },
    };

}

const fetchTaskDefRecords = async (query, description, logger) => {
    const taskRecords = [];
    try {
        await application.data
            .object('object_task_def')
            .select(
                '_id',
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
            .where(query)
            .findStream(async records => {
                taskRecords.push(...records.map(item => item));
            });
        logger.info(`${description} 查询成功：`, taskRecords.length);
        return taskRecords;
    } catch (error) {
        logger.error(`${description}查询时发生错误：`, error);
        return taskRecords;
    }
};


async function createTaskMonitorEntry(task, logger) {
    try {
        const taskBatchNo = await faas.function('GetTaskBatchNumber').invoke({object_task_def: task});
        const batch_no = task._id + '-' + taskBatchNo.batch_no;
        //创建任务处理记录
        const createData = {
            task_def: {_id: task._id},
            batch_no: batch_no,
            option_status: "option_01",
            task_create_time: dayjs().valueOf(),
        };
        const createDataId = await application.data.object('object_task_create_monitor').create(createData);
        return {code: 0, message: '成功创建任务处理记录', task_id: createDataId._id};
    } catch (error) {
        logger.error(`创建任务处理记录[${task._id}]失败-->`, error);
        return {code: -1, message: error.message, task_id: task._id};
    }
}

async function createStoreTaskEntry(task, logger) {
    try {
        const query = {
            _id: task.task_def._id,
        };
        //获取符合条件的任务定义记录列表
        let finalTaskDefList = await fetchTaskDefRecords(query, '根据ID查询任务定义', logger);
        const createDatas = [];
        for (let i = 0; i < finalTaskDefList.length; i++) {
            const item = finalTaskDefList[i];
            let task_plan_time = dayjs(item.datetime_start).add(item.deal_duration, 'day').valueOf();
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
                task_handler: {_id: item.task_publisher._id},  //任务负责人
                option_upload_imagede: item.option_upload_image,  //任务要求上传图片
                option_input_informationdd: item.option_input_informationdd,  //任务要求录入完成信息
                option_upload_attachementdd: item.option_upload_attachementdd,  //任务要求上传附件
                set_warning_time: item.set_warning_time,  //是否设置任务到期前提醒
                warning_time: item.warning_time,  //预警时间（小时）
                source_department: {_id: item.publish_department._id},//任务来源
                option_priority: item.option_priority//优先级
                // deal_department = {_id:} //任务所属部门
            };
            //飞书群
            if (item.option_handler_type === "option_01") {
                //群组赛选规则
                const chatRecordList = await faas.function('DeployChatRange').invoke({deploy_rule: item.chat_rule});
                logger.info(`群组筛选规则[${item.chat_rule._id}]返回群数量->`, chatRecordList.length)
                for (let j = 0; j < chatRecordList.length; j++) {
                    //为任务处理记录创建门店普通任务
                    createData.task_chat = {_id: chatRecordList[j]._id} //负责群
                    createDatas.push(createData);
                }
            } else if (item.option_handler_type === "option_02") {
                //人员塞选规则
                // item.user_rule;
                //为任务处理记录创建门店普通任务
                // createData.task_handler = {_id: }, //负责人
                createDatas.push(createData);
            }
        }
        logger.info(`需要为任务处理记录[${task._id}]创建的门店普通任务数量->`, createDatas.length);
        if (createDatas.length > 0) {
            const storeTaskCreateResults = await Promise.all(createDatas.map(task => createStoreTaskEntryStart(task, logger)));
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
            logger.warn("根据任务定义群组和人员筛选规则查询结果为空")
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

async function createStoreTaskEntryStart(task, logger) {
    try {
        const storeTaskId = await application.data.object('object_store_task').create(task);
        //发送消息发片
        try {
            let name = task.name;
            let description = task.description
            const content = {
                "config": {
                    "wide_screen_mode": true
                },
                "elements": [
                    {
                        "tag": "div",
                        "text": {
                            "content": description,
                            "tag": "plain_text"
                        }
                    }
                ],
                "header": {
                    "template": "turquoise",
                    "title": {
                        "content": name,
                        "tag": "plain_text"
                    }
                }
            }
            let json = JSON.stringify(content);
            const data = {
                receive_id_type: "", //接收方类型：open_id/user_id/union_id/email/chat_id text
                msg_type: "interactive", //消息类型：text、post、image、file、audio、media、sticker、interactive、share_chat、share_user text
                receive_id: "", //接收方ID text
                content: json, //消息卡片内容  JSON
            }
            if (task.task_chat) {
                //获取群组ID
                const feishuChat = await application.data.object('object_feishu_chat')
                    .select('_id', 'chat_id')
                    .where({_id: task.task_chat._id}).findOne();
                data.receive_id_type = "chat_id"
                data.receive_id = feishuChat.chat_id
            } else {
                data.receive_id_type = "email"
                data.receive_id = task.deal_user._email
            }
            return {code: 0, message: '创建门店普通任务成功', storeTaskId: storeTaskId, messageCardSendData: data};
        } catch (error) {
            logger.error(`组装门店普通任务[${task}]发送消息发片失败-->`, error);
        }
    } catch (error) {
        logger.error(`创建门店普通任务失败-->`, error);
        return {code: -1, message: '创建门店普通任务失败：' + error, task: task,};
    }
}

const sendFeishuMessage = async (messageCardSendData) => {
    try {
        await faas.function('MessageCardSend').invoke(messageCardSendData.sendMessages);
        return {code: 0, message: `门店普通任务[${messageCardSendData.storeTaskId}]发送飞书消息成功`, result: 'success'};
    } catch (error) {
        return {code: -1, message: error.message, result: 'failed'};
    }
};

