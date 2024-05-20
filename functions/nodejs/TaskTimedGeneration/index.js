// 通过 NPM dependencies 成功安装 NPM 包后此处可引入使用
// 如安装 linq 包后就可以引入并使用这个包
const dayjs = require('dayjs');
const {createLimiter, newLarkClient} = require('../utils');
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
    logger.info(`批量创建aPaaS任务 函数开始执行 ${new Date()}`, params);

    const {task_def_record} = params;
    if (!task_def_record) {
        logger.warn('未传入有效的任务定义记录');
        return {code: -1, message: '未传入有效的任务定义记录'};
    }
    // 1. 第一步根据任务定义列表创建任务处理记录（任务批次）
    // 为每个任务定义实例记录生成任务批次号并创建任务处理记录（任务批次）
    const taskBatchNumberCreateResult = await createTaskMonitorEntry(task_def_record, logger);

    if (taskBatchNumberCreateResult.code !== 0) {
        logger.error('任务处理记录（任务批次）生成失败', taskBatchNumberCreateResult);
        return {code: -2, message: '任务处理记录（任务批次）生成失败'};
    }
    logger.info(`成功创建任务处理记录（任务批次）`, taskBatchNumberCreateResult);

    //创建限流器
    const limitedSendFeishuMessage = createLimiter(sendFeishuMessage);
    const client = await newLarkClient({userId: context.user._id}, logger);
    //2.  第二步根据任务定义，创建抄送人apass数据，给抄送人发送飞书消息
    if (task_def_record.carbon_copy) {
        const carbonCopy = task_def_record.carbon_copy;
        const userList = await faas.function('DeployMemberRange').invoke({user_rule: carbonCopy});
        logger.info(`抄送人员筛选规则[${carbonCopy._id}]返回人员数量->`, userList.length,'详情->',JSON.stringify(userList,null,2))
        if (userList.length > 0) {
            const res = await getTaskDefCopyAndFeishuMessageStructure(userList, task_def_record, taskBatchNumberCreateResult.object_task_create_monitor,logger);
            const cardDataList = res.cardDataList;
            const sendFeishuMessageResults = await Promise.all(cardDataList.map(item => limitedSendFeishuMessage(item)));
            const sendFeishuMessageSuccess = sendFeishuMessageResults.filter(result => result.code === 0);
            const sendFeishuMessageFail = sendFeishuMessageResults.filter(result => result.code !== 0);
            logger.info(`根据抄送人员筛选规则需要发送飞书数量->${cardDataList.length},成功数量->${sendFeishuMessageSuccess.length},失败数量->${sendFeishuMessageFail.length}`);
            const apassDataList = res.apassDataList;
            const createApassDataResults = await Promise.all(apassDataList.map(item => createApassData(item)));
            const createApassDataSuccess = createApassDataResults.filter(result => result.code === 0);
            const createApassDataFail = createApassDataResults.filter(result => result.code !== 0);
            logger.info(`根据抄送人员筛选规则需要创建抄送人apass数据数量->${apassDataList.length},成功数量->${createApassDataSuccess.length},失败数量->${createApassDataFail.length}`);
        }
    }
    // 3. 第三步根据任务处理记录（任务批次）创建门店普通任务
    //创建门店普通任务

    // 删除任务批次号的redis缓存
    await kunlun.redis.del(taskBatchNumberCreateResult?.task_id);

    // 调用创建门店普通任务函数
    const storeTaskCreateResults = await createStoreTaskEntry(task_def_record, taskBatchNumberCreateResult.object_task_create_monitor, logger, limitedSendFeishuMessage);
    logger.info(`成功批量创建门店普通任务`, storeTaskCreateResults);

    return {
        code: storeTaskCreateResults.code,
        message: '任务处理记录（任务批次）生成完成',
        data: storeTaskCreateResults,
    };
};


/**
 * @description 创建任务批次记录
 * @param {*} task
 * @param {*} logger
 * @returns
 */
async function createTaskMonitorEntry(task, logger) {
    try {
        const taskBatchNo = await faas.function('GetTaskBatchNumber').invoke({object_task_def: task});
        const batch_no = taskBatchNo.batch_no;
        const batch_progress = taskBatchNo.batch_progress;
        //判断redis中是否含有任务定义主键
        const value = await kunlun.redis.get(task._id);
        if (value != null) {
            logger.warn(`创建任务定义[${task._id}]的任务处理记录（任务批次）失败->该任务定义正在执行中...`);
            return {
                code: -1,
                message: `创建任务定义[${task._id}]的任务处理记录（任务批次）失败->当前任务定义的任务处理记录（任务批次）正在生成中...`,
                task_id: task._id,
            };
        }

        let res = await application.data
            .object('object_task_create_monitor')
            .select('_id')
            .where(
                _.and({
                    task_def: {_id: task._id},
                    task_create_time: _.lte(dayjs().startOf('day').valueOf()),
                }),
            )
            .findOne();
        if (res) {
            logger.warn(`创建任务定义[${task._id}]的任务处理记录（任务批次）失败->该任务定义当天任务处理记录（任务批次）已存在...`);
            return {
                code: -1,
                message: `创建任务定义[${task._id}]的任务处理记录（任务批次）失败->当前任务定义当天任务处理记录（任务批次）已存在...`,
                task_id: task._id,
            };
        }
        await kunlun.redis.set(task._id, batch_no);
        //创建任务处理记录（任务批次）
        const createData = {
            task_def: {_id: task._id},
            batch_no: batch_no,
            batch_progress: batch_progress,
            option_status: 'option_01',
            task_create_time: dayjs().valueOf(),
        };
        // 创建任务处理记录（任务批次）
        const createDataResult = await application.data.object('object_task_create_monitor').create(createData);
        createData._id = createDataResult._id;
        return {
            code: 0,
            message: `创建任务定义[${task._id}]的任务处理记录（任务批次）成功`,
            task_id: task._id,
            task_create_monitor_id: createDataResult._id,
            object_task_create_monitor: createData,
        };
    } catch (error) {
        logger.error(`创建任务处理记录（任务批次）[${task._id}]失败-->`, error);
        return {code: -1, message: error.message, task_id: task._id};
    }
}

/**
 * @description 构造门店普通任务aPaaS数据
 * @param {*} taskDef
 * @param {*} task
 * @param {*} logger
 * @param {*} client
 * @param {*} limitedSendFeishuMessage
 * @returns
 */
async function createStoreTaskEntry(taskDef, task, logger, limitedSendFeishuMessage) {
    // task 代表任务处理记录（任务批次）
    const createDataList = [];
    try {
        const item = taskDef;
        //任务截止时间
        let task_plan_time = dayjs(task.task_create_time).add(item.deal_duration, 'day').valueOf();
        logger.info(`任务处理记录（任务批次）[${task._id}]对应的任务定义详情->`, JSON.stringify(task, null, 2));
        //获取部门详情
        let department_record = await application.data.object('_department').select('_id', "_name").where({_id: item.publish_department.id}).findOne();
        logger.info(`获取部门详情->`, JSON.stringify(department_record, null, 2));
        //飞书群
        if (item.option_handler_type === 'option_01') {
            //群组赛选规则
            const chatRecordList = await faas.function('DeployChatRange').invoke({deploy_rule: item.chat_rule});
            logger.info(`群组筛选规则[${item.chat_rule._id}]返回群数量->`, chatRecordList.length);
            logger.info(`群组筛选规则[${item.chat_rule._id}]返回群详情->`, JSON.stringify(chatRecordList, null, 2));
           for (const chatRecordListElement of chatRecordList) {
                const createData = {
                    name: item.name,
                    description: item.description,
                    task_def: {_id: item._id}, //任务定义
                    task_monitor: {_id: task._id}, //任务创建记录
                    task_status: 'option_pending',
                    //其他字段
                    task_create_time: task.task_create_time, //任务创建时间
                    task_plan_time: task_plan_time, //要求完成时间 ===  开始时间 + 任务处理时长
                    is_overdue: 'option_no', //是否超期
                    option_upload_imagede: item.option_upload_image, //任务要求上传图片
                    option_input_informationdd: item.option_input_information, //任务要求录入完成信息
                    option_upload_attachementdd: item.option_upload_attachement, //任务要求上传附件
                    set_warning_time: item.set_warning_time, //是否设置任务到期前提醒
                    warning_time: item.warning_time, //预警时间（小时）
                    source_department: {_id: department_record._id, _name: department_record._name}, //任务来源
                    option_priority: item.option_priority, //优先级
                };
                //为任务处理记录（任务批次）创建门店普通任务
                createData.task_chat = {_id: chatRecordListElement._id}; //负责群
                //查询飞书群所在部门
                const feishu_chat = await application.data.object('object_feishu_chat').select('_id', 'department').where({_id: chatRecordListElement._id}).findOne();
                if (feishu_chat) {
                    createData.deal_department = {_id: feishu_chat.department._id}; //任务所属部门
                }
                createDataList.push(createData);
            }
        } else if (item.option_handler_type === 'option_02') {
            //人员塞选规则
            const userList = await faas.function('DeployMemberRange').invoke({user_rule: item.user_rule});
            logger.info(`人员筛选规则[${item.user_rule._id || item.user_rule.id}]返回人员数量->`, userList.length, JSON.stringify(userList, null, 2));
            for (const userListElement of userList) {
                const createData = {
                    name: item.name,
                    description: item.description,
                    task_def: {_id: item._id}, //任务定义
                    task_monitor: {_id: task._id}, //任务创建记录
                    task_status: 'option_pending',
                    //其他字段
                    task_create_time: task.task_create_time, //任务创建时间
                    task_plan_time: task_plan_time, //要求完成时间 ===  开始时间 + 任务处理时长
                    is_overdue: 'option_no', //是否超期
                    option_upload_imagede: item.option_upload_image, //任务要求上传图片
                    option_input_informationdd: item.option_input_information, //任务要求录入完成信息
                    option_upload_attachementdd: item.option_upload_attachement, //任务要求上传附件
                    set_warning_time: item.set_warning_time, //是否设置任务到期前提醒
                    warning_time: item.warning_time, //预警时间（小时）
                    source_department: {_id: department_record._id, _name: department_record._name}, //任务来源
                    option_priority: item.option_priority, //优先级
                };
                //为任务处理记录（任务批次）创建门店普通任务
                createData.task_handler = {_id: userListElement._id}; //负责人
                //查询人员所在部门
                const user = await application.data.object('_user').select('_id', '_department').where({_id: userListElement._id}).findOne();
                createData.deal_department = {_id: user._department._id}; //任务所属部门
                createDataList.push(createData);
            }
        }
        logger.info(`需要为任务处理记录（任务批次）[${task._id}], 创建的门店普通任务数量->`, createDataList.length);

        if (createDataList.length > 0) {
            const storeTaskCreateResults = await Promise.all(createDataList.map(task => createStoreTaskEntryStart(task, logger)));
            const successfulStoreTasks = storeTaskCreateResults.filter(result => result.code === 0);
            const failedStoreTasks = storeTaskCreateResults.filter(result => result.code !== 0);
            logger.info(`为任务处理记录（任务批次）[${task._id}]创建门店普通任务成功数量: ${successfulStoreTasks.length}, 失败数量: ${failedStoreTasks.length}`);
            const messageCardSendDatas = [];
            successfulStoreTasks.forEach(item => {
                if (item.messageCardSendData && Object.keys(item.messageCardSendData).length > 0) {
                    messageCardSendDatas.push(item.messageCardSendData);
                }
            });
            //修改任务处理记录（任务批次）状态为 处理中 / 失败
            const updateData = {
                _id: task._id,
                option_status: 'option_05',
                option_status_show: `任务创建成功,成功发布任务数量：${successfulStoreTasks.length}`,
            };
            if (failedStoreTasks.length > 0) {
                updateData.option_status = 'option_03';
                updateData.option_status_show = `任务创建部分成功,应创建任务数量：${storeTaskCreateResults.length},成功数量：${successfulStoreTasks.length},失败数量：${failedStoreTasks.length}`;
            }
            //发送飞书卡片消息
            logger.info(`根据门店普通任务创建记录需要发送飞书数量---->${messageCardSendDatas.length}`);
            const sendFeishuMessageResults = await Promise.all(messageCardSendDatas.map(messageCardSendData => limitedSendFeishuMessage(messageCardSendData)));

            const sendFeishuMessageSuccess = sendFeishuMessageResults.filter(result => result.code === 0);
            const sendFeishuMessageFail = sendFeishuMessageResults.filter(result => result.code !== 0);
            logger.info(`根据门店普通任务创建记录发送飞书消息成功数量: ${sendFeishuMessageSuccess.length}, 失败数量: ${sendFeishuMessageFail.length}`);
            //门店创建数量 》飞书消息发送数量
            if (successfulStoreTasks.length > sendFeishuMessageSuccess.length) {
                updateData.option_status_show =
                    updateData.option_status_show +
                    `,飞书消息发送部分成功，应发送飞书消息数量：${sendFeishuMessageResults.length},成功数量：${sendFeishuMessageSuccess.length},失败数量：${sendFeishuMessageFail.length}`;
            } else {
                updateData.option_status_show = updateData.option_status_show + `,飞书消息发送成功,成功发送飞书消息数量：${sendFeishuMessageSuccess.length}`;
            }
            try {
                await application.data.object('object_task_create_monitor').update(updateData);
            } catch (error) {
                logger.error(`修改任务处理记录（任务批次）[${task._id}]状态为处理中失败-->`, error);
            }
        } else {
            logger.warn('根据任务定义群组和人员筛选规则查询结果为空');
            try {
                const updateData = {
                    _id: task._id,
                    option_status: 'option_03',
                    option_status_show: '任务创建失败,根据筛选规则查询结果为0,请检查任务定义筛选规则',
                };
                await application.data.object('object_task_create_monitor').update(updateData);
            } catch (error) {
                logger.error(`修改任务处理记录（任务批次）[${task._id}]状态为失败失败-->`, error);
            }
        }
        return {code: 0, message: '为任务处理记录（任务批次）组装门店普通任务成功', task_id: task._id};
    } catch (error) {
        logger.error(`为任务处理[${task._id}]记录组装门店普通任务失败-->`, error);
        //修改任务处理记录（任务批次）状态为失败
        try {
            const updateData = {
                _id: task._id,
                option_status: 'option_03',
                option_status_show: '任务创建失败,内部错误',
            };
            await application.data.object('object_task_create_monitor').update(updateData);
        } catch (error) {
            logger.error(`修改任务处理记录（任务批次）[${task._id}]状态为失败失败-->`, error);
        }
        return {code: -1, message: error.message, task_id: task._id};
    }
}

/**
 * @description 创建门店普通任务，并发送消息
 * @param {*} task
 * @param {*} logger
 * @returns
 */
async function createStoreTaskEntryStart(task, logger) {
    // task 代表门店普通任务
    try {
        logger.info('createStoreTaskEntryStart[task]--->', task);
        const storeTaskId = await application.data.object('object_store_task').create(task);
        // await faas.function('CreateFsTask').invoke({ storeTaskId: storeTaskId._id });
        const data = {
            receive_id_type: '', //接收方类型：open_id/user_id/union_id/email/chat_id text
            msg_type: 'interactive', //消息类型：text、post、image、file、audio、media、sticker、interactive、share_chat、share_user text
            receive_id: '', //接收方ID text
            content: '', //消息卡片内容  JSON
        };
        // 发送消息卡片
        try {
            let priority = await faas.function('GetOptionName').invoke({
                table_name: 'object_store_task',
                option_type: 'option_priority',
                option_api: task.option_priority,
            });
            //  需要替换 记录 ID 1799205024994314 { _id: 1799205024994314 }
            // 需要打开表单的流程
            // `https://applink.feishu.cn/client/web_app/open?mode=sidebar&appId=cli_a6b23873d463100b&path=/ae/user/pc/one_store__c/system_page/action&1=1&objectApiName2RecordIds%5Bone_store__c__object_aadgfx2qchmdi%5D%5B0%5D=${storeTaskId._id}&1=1&version=v2&actionApiName=automation_0e8567ea5a4&namespace=one_store__c&recordID=`
            // 直接运行的流程
            // `https://applink.feishu.cn/client/web_app/open?mode=sidebar&appId=cli_a6b23873d463100b&path=/ae/user/pc/one_store__c/system_page/action&1=1&variables%5B0%5D%5BvarApiName%5D=customizeInput__original__717a10b5&variables%5B0%5D%5BinputValue%5D=${storeTaskId._id}&1=1&actionApiName=automation_952bc370750&namespace=one_store__c&recordID=&version=v2`

            //判断执行流程的url
            const url = "https://et6su6w956.feishuapp.cn/ae/apps/one_store__c/aadgik5q3gyhw?params_var_bcBO3kSg=" + storeTaskId._id;
            const pc_url = "https://et6su6w956.feishuapp.cn/ae/apps/one_store__c/aadgik5q3gyhw?params_var_bcBO3kSg=" + storeTaskId._id;
            const android_url = "https://et6su6w956.feishuapp.cn/ae/apps/one_store__c/aadgihlti4uni?params_var_LLsDqf8w=" + storeTaskId._id;
            const ios_url = "https://et6su6w956.feishuapp.cn/ae/apps/one_store__c/aadgihlti4uni?params_var_LLsDqf8w=" + storeTaskId._id;
            const hourDiff = (task.task_plan_time - dayjs().valueOf()) / 36e5;
            const content = {
                config: {
                    wide_screen_mode: true,
                },
                elements: [
                    {
                        tag: 'div',
                        text: {
                            content: '任务优先级：' + priority.option_name,
                            tag: 'plain_text',
                        },
                    },
                    {
                        tag: 'div',
                        text: {
                            content: '任务来源：' + task.source_department._name.find(item => item.language_code === 2052).text,
                            tag: 'plain_text',
                        },
                    },
                    {
                        tag: 'div',
                        text: {
                            content: '任务下发时间：' + dayjs(task.task_create_time).add(8,"hour").format('YYYY-MM-DD HH:mm:ss'),
                            tag: 'plain_text',
                        },
                    },
                    {
                        tag: 'div',
                        text: {
                            content: '距离截至时间还有' + hourDiff.toFixed(2) + '小时',
                            tag: 'plain_text',
                        },
                    },
                    {
                        tag: 'hr',
                    },
                    {
                        "tag": "action",
                        "actions": [
                            {
                                "tag": "button",
                                "text": {
                                    "tag": "plain_text",
                                    "content": "查看详情"
                                },
                                "type": "primary",
                                "multi_url": {
                                    "url": url,
                                    "pc_url": pc_url,
                                    "android_url": android_url,
                                    "ios_url": ios_url
                                }
                            }
                        ]
                    }
                ],
                header: {
                    template: 'turquoise',
                    title: {
                        content: '【任务发布】有一条' + task.name + '门店任务请尽快处理！',
                        tag: 'plain_text',
                    },
                },
            };

            data.content = JSON.stringify(content);
            if (task.task_chat) {
                // logger.info("发送到群里----->",JSON.stringify(task.task_chat,null,2));
                //获取群组ID
                const feishuChat = await application.data
                    .object('object_feishu_chat')
                    .select('_id', 'chat_id')
                    .where({_id: task.task_chat._id || task.task_chat.id})
                    .findOne();
                data.receive_id_type = 'chat_id';
                data.receive_id = feishuChat.chat_id;
            } else {
                // logger.info("发送到人员----->",JSON.stringify(task.task_handler,null,2));
                const feishuPeople = await application.data
                    .object('_user')
                    .select('_id', '_email', '_name', '_lark_user_id', "_department")
                    .where({_id: task.task_handler._id || task.task_handler.id})
                    .findOne();
                // 判断是群组发送（查询所在部门的门店群）还是机器人（机器人直发）发送
                let object_task_def = await application.data
                    .object('object_task_def')
                    .select('_id', 'send_channel')
                    .where({_id: task.task_def._id || task.task_def.id})
                    .findOne();
                if (object_task_def.send_channel === 'option_group') {
                    data.receive_id_type = 'chat_id';
                    //通过部门ID获取飞书群ID
                    let object_feishu_chat = await application.data
                        .object('object_feishu_chat')
                        .select('_id', 'chat_id')
                        .where({department: feishuPeople._department._id || feishuPeople._department.id})
                        .findOne();
                    logger.info("获取部门所在飞书群----->", JSON.stringify(object_feishu_chat, null, 2));
                    if (!object_feishu_chat) {
                        logger.warn(`该用户[${feishuPeople._id}]的部门飞书群不存在`);
                        return {
                            code: 0,
                            message: `创建门店普通任务成功&组装门店普通任务[${task._id}]发送消息卡片失败`,
                            messageCardSendData: {}
                        };
                    }
                    data.receive_id = object_feishu_chat.chat_id;

                } else {
                    // logger.info("通过机器人发送----->");
                    data.receive_id_type = 'user_id';
                    data.receive_id = feishuPeople._lark_user_id;
                    content.header.title.content =
                        '【任务发布】' + feishuPeople._name.find(item => item.language_code === 2052).text + '有一条' + task.name + '门店任务请尽快处理！';
                    data.content = JSON.stringify(content);
                }
            }
            return {code: 0, message: '创建门店普通任务成功', messageCardSendData: data};
        } catch (error) {
            logger.error('messageCardSendData--->', JSON.stringify(data, null, 2));
            logger.error(`组装门店普通任务[${task._id}]发送消息卡片失败-->`, error);
            return {
                code: 0,
                message: `创建门店普通任务成功&组装门店普通任务[${task._id}]发送消息卡片失败`,
                storeTaskId: storeTaskId._id,
                messageCardSendData: {},
            };
        }
    } catch (error) {
        logger.error(`创建门店普通任务失败-->`, error);
        return {code: -1, message: '创建门店普通任务失败：' + error, task: task};
    }
}

/**
 * @description 构造apass抄送人数据，构造飞书消息卡片
 * @param {*} userList 用户列表
 * @param {*} task_def_record 任务定义
 * @param {*} object_task_create_monitor 任务批次
 * @param {*} logger 日志
 * @returns
 */
async function getTaskDefCopyAndFeishuMessageStructure(userList, task_def_record, object_task_create_monitor,logger) {
    const cardDataList = [];
    const apassDataList = [];
    logger.info("抄送任务定义详情->",JSON.stringify(task_def_record,null,2),"任务批次详情->",JSON.stringify(object_task_create_monitor,null,2));
    //获取部门详情
    let department_record = await application.data.object('_department').select('_id', "_name").where({_id: task_def_record.publish_department.id||task_def_record.publish_department._id}).findOne();
    //遍历人员
    for (const user of userList) {
        //飞书消息
        const cardData = {
            receive_id_type: 'user_id', //接收方类型：open_id/user_id/union_id/email/chat_id text
            msg_type: 'interactive', //消息类型：text、post、image、file、audio、media、sticker、interactive、share_chat、share_user text
            receive_id: user.user_id, //接收方ID text
            content: '', //消息卡片内容  JSON
        };
        let priority = await faas.function("GetOptionName").invoke({
            table_name: "object_task_def",
            option_type: "option_priority",
            option_api: task_def_record.option_priority
        });
        const url = "https://et6su6w956.feishuapp.cn/ae/apps/one_store__c/aadgigzw3e2as?params_var_5CWWdDBS="+task_def_record._id+"&lane_id=develop"
        const pc_url =  "https://et6su6w956.feishuapp.cn/ae/apps/one_store__c/aadgigzw3e2as?params_var_5CWWdDBS="+task_def_record._id+"&lane_id=develop"
        const android_url =  ""
        const ios_url =  ""
        const hourDiff = (object_task_create_monitor.task_plan_time - dayjs().valueOf()) / 36e5;
        const content = {
            config: {
                wide_screen_mode: true,
            },
            elements: [
                {
                    "tag": "div",
                    "text": {
                        "content": "任务标题：" + task_def_record.name,
                        "tag": "plain_text"
                    }
                },
                {
                    "tag": "div",
                    "text": {
                        "content": "任务描述：" + task_def_record.description,
                        "tag": "plain_text"
                    }
                },
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
                        "content": "任务来源：" + department_record._name.find(item => item.language_code === 2052).text,
                        "tag": "plain_text"
                    }
                },
                {
                    "tag": "div",
                    "text": {
                        "content": "任务下发时间：" + dayjs(object_task_create_monitor.task_create_time).add(8,"hour").format('YYYY-MM-DD HH:mm:ss'),
                        "tag": "plain_text"
                    }
                },
                {
                    "tag": "div",
                    "text": {
                        "content": "距离截至时间还有" + hourDiff.toFixed(2) + "小时",
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
                                "content": "查看详情"
                            },
                            "type": "primary",
                            "multi_url": {
                                "url": url,
                                "pc_url": pc_url,
                                "android_url": android_url,
                                "ios_url": ios_url
                            }
                        }
                    ]
                }
            ],
            header: {
                template: 'turquoise',
                title: {
                    content: '【任务抄送】有一条门店任务发布！',
                    tag: 'plain_text',
                },
            },
        };
        cardData.content = JSON.stringify(content);
        if (cardData.receive_id){
            cardDataList.push(cardData);
        }else {
            logger.warn("抄送人的user_id为null->",JSON.stringify(user,2,null))
        }
        //apass数据
        const apassData = {
            task_def: {_id: task_def_record._id},
            task_create_monitor: {_id: object_task_create_monitor._id},
            carbon_copy: {_id: user._id}
        }
        apassDataList.push({
            objectApiName: "object_task_def_copy",
            data: apassData
        });
    }
    return {code: 0, cardDataList: cardDataList, apassDataList: apassDataList};
}

/**
 * @description 发送飞书消息
 * @param {*} messageCardSendData
 * @returns
 */
const sendFeishuMessage = async messageCardSendData => {
    try {
        await faas.function('MessageCardSend').invoke({
            receive_id_type: messageCardSendData.receive_id_type,
            receive_id: messageCardSendData.receive_id,
            msg_type: messageCardSendData.msg_type,
            content: messageCardSendData.content
        });
        return {code: 0, message: `飞书消息发送成功`, result: 'success'};
    } catch (error) {
        return {
            code: -1,
            message: `飞书消息发送失败：` + error.message,
            result: 'failed',
        };
    }
};
/**
 * @description 创建apass数据
 * @param {*} apassData
 * @returns
 */
const createApassData = async apassData => {
    try {
        await application.data.object(apassData.objectApiName).create(apassData.data);
        return {code: 0, message: `创建apass数据成功`, result: 'success'};
    } catch (error) {
        return {
            code: -1,
            message: `创建apass数据失败->` + error.message,
            result: 'failed',
        };
    }
};
