// 通过 NPM dependencies 成功安装 NPM 包后此处可引入使用
// 如安装 linq 包后就可以引入并使用这个包
// const linq = require("linq");

const {createLimiter, newLarkClient} = require("../utils");
const dayjs = require("dayjs");
/**
 * @param {Params}  params     自定义参数
 * @param {Context} context    上下文参数，可通过此参数下钻获取上下文变量信息等
 * @param {Logger}  logger     日志记录器
 *
 * @return 函数的返回数据
 */
module.exports = async function (params, context, logger) {
    // 日志功能
    logger.info(`${new Date()} 定时提醒任务函数开始执行`);
    // 获取符合条件的门店普通任务
    let globaNowTime = dayjs().valueOf(); //当前时间时间戳
    const query = {
        //待处理：option_pending，已转办：option_transferred，已完成：option_completed，打回：option_rollback，已取消：option_cancelled
        task_status: application.operator.in('option_pending', 'option_transferred', 'option_rollback'), //任务状态
        task_plan_time: application.operator.gte(globaNowTime),  //要求完成时间  时间戳
        set_warning_time: "option_yes" //是否设置预警
    }
    logger.info("query--->", query);
    let res = await application.data.object("object_store_task")
        .select(
            "_id",
            "name",
            "description",
            "task_chat",
            "task_handler",
            "task_plan_time",
            "warning_time",
            "option_priority",
            "source_department",
            "task_create_time",
            "deadline_time",)
        .where(query).find();
    logger.info("查询[待处理&已转办&退回]门店普通任务记录数量->", res.length);
    const object_store_task = [];
    for (const re of res) {
        //当前时间
        let nowTime = dayjs(globaNowTime);
        //要求完成时间
        let taskPlanTime = dayjs(re.task_plan_time);
        //告警时间：当前时间 + 任务到期前提醒时间（小时）
        let number = Number.parseInt(re.warning_time);
        let warningEndTime = nowTime.add(number, 'hour');
        let warnindStartTime = nowTime.add(number - 1, 'hour');
        //当前时间 + 任务到期前提醒时间（小时） 晚于 要求完成时间  && 一个小时内
        if (!warningEndTime.isBefore(taskPlanTime) && warnindStartTime.isBefore(taskPlanTime)) {
            //一个小时内
            object_store_task.push(re);
        }
    }
    logger.info("符合提醒的门店普通任务记录数量->", object_store_task.length);
    const client = await newLarkClient({userId: context.user._id}, logger);
    //需要发送提醒的消息记录
    const messageCardSendDatas = [];
    for (const objectStoreTaskElement of object_store_task) {

        //任务定义
        // const object_task_def = await application.data.object("object_task_def")
        //     .select('_id',
        //         'name', //任务名称
        //         'task_number', //任务编码
        //         'description', //任务描述
        //         'task_tag', //任务分类（对象）
        //         'option_method', //任务周期（全局选项）：计划任务：option_01，一次性任务：option_02
        //         'option_time_cycle', //任务定义（全局选项）：天:option_day，周:option_week，月:option_month，季度:option_quarter，半年:option_half_year，年:option_year
        //         'repetition_rate', //重复频率
        //         'boolean_public_now', //是否立即发布
        //         'datetime_publish', //发布时间
        //         'datetime_start', //开始时间
        //         'datetime_end', //结束时间
        //         'deal_duration', //任务处理时长
        //         'option_status', //状态（全局选项）：新建:option_01，启用:option_02，禁用:option_03
        //         'send_channel', //发送渠道（全局选项）：发送到飞书群:option_group，发送到个人:option_user
        //         'option_handler_type', //任务处理人类型（全局选项）：飞书群:option_01，责任人：option_02
        //         'chat_rule', //群组筛选规则（对象）
        //         'user_rule', //人员筛选规则（对象）
        //         'carbon_copy', //任务抄送人（对象）
        //         'option_is_check', //任务是否需要验收(全局选项)：是：option_yes，否：option_no
        //         'check_flow', //任务验收流程(对象)
        //         'task_publisher', //发布人（对象）
        //         'publish_department', //发布人所属部门(对象)
        //         'option_priority', //优先级(全局选项)：高:option_01，中:option_02，低:option_03
        //         'option_upload_image', //任务要求上传图片
        //         'option_input_information', //任务要求录入完成信息
        //         'option_upload_attachement', //任务要求上传附件
        //         'is_workday_support', //是否支持工作日历 布尔
        //         'warning_time', //设置预警时间（小时）
        //         'set_warning_time' //设置任务到期前提醒
        //     )
        //     .where({_id: objectStoreTaskElement.task_def._id}).findOne();

        let description = objectStoreTaskElement.description
        let priority = await faas.function("GetOptionName").invoke({
            table_name: "object_store_task",
            option_type: "option_priority",
            option_api: objectStoreTaskElement.option_priority
        });
        //判断执行流程的url
        const url =  "https://et6su6w956.feishuapp.cn/ae/apps/one_store__c/aadgik5q3gyhw?params_var_bcBO3kSg=" + objectStoreTaskElement._id;
        const pc_url = "https://et6su6w956.feishuapp.cn/ae/apps/one_store__c/aadgik5q3gyhw?params_var_bcBO3kSg=" + objectStoreTaskElement._id;
        const android_url = "https://et6su6w956.feishuapp.cn/ae/apps/one_store__c/aadgihlti4uni?params_var_LLsDqf8w=" + objectStoreTaskElement._id;
        const ios_url = "https://et6su6w956.feishuapp.cn/ae/apps/one_store__c/aadgihlti4uni?params_var_LLsDqf8w=" + objectStoreTaskElement._id;
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
                        "content": "任务来源：" + objectStoreTaskElement.source_department._name.find(item => item.language_code === 2052).text,
                        "tag": "plain_text"
                    }
                },
                {
                    "tag": "div",
                    "text": {
                        "content": "任务下发时间：" + dayjs(objectStoreTaskElement.task_create_time).add(8,"hour").format('YYYY-MM-DD HH:mm:ss'),
                        "tag": "plain_text"
                    }
                },
                {
                    "tag": "div",
                    "text": {
                        "content": "距离截至时间还有" + Number.parseFloat(objectStoreTaskElement.deadline_time).toFixed(2) + "小时",
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
            "header": {
                "template": "turquoise",
                "title": {
                    "content": "【任务到期提醒】有一条" + objectStoreTaskElement.name + "门店任务请尽快处理！",
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
        if (objectStoreTaskElement.task_chat) {
            //获取群组ID
            const feishuChat = await application.data.object('object_feishu_chat')
                .select('_id', 'chat_id')
                .where({_id: objectStoreTaskElement.task_chat._id}).findOne();
            data.receive_id_type = "chat_id"
            data.receive_id = feishuChat.chat_id
            messageCardSendDatas.push(data);
        } else {
            const feishuPeople = await application.data.object('_user')
                .select('_id', "_department", "_lark_user_id")
                .where({_id: objectStoreTaskElement.task_handler._id}).findOne();
            content.header.title.content = "【任务到期提醒】" + feishuPeople._name.find(item => item.language_code === 2052).text + "有一条" + objectStoreTaskElement.name + "门店任务请尽快处理！";
            data.content = JSON.stringify(content);
            //判断是群组发送（查询所在部门的门店群）还是机器人（机器人直发）发送
            let object_task_def = await application.data.object("object_task_def")
                .select("_id", "send_channel")
                .where({_id: objectStoreTaskElement.task_def._id || objectStoreTaskElement.task_def.id}).findOne();
            if (object_task_def.send_channel === "option_group") {
                // logger.info("通过用户获取部门----->",JSON.stringify(user,null,2));
                //通过部门ID获取飞书群ID
                let object_feishu_chat = await application.data.object("object_feishu_chat")
                    .select("_id", "chat_id")
                    .where({department: feishuPeople._department._id || feishuPeople._department.id}).findOne();
                if (object_feishu_chat){
                    data.receive_id_type = "chat_id"
                    data.receive_id = object_feishu_chat.chat_id
                    messageCardSendDatas.push(data);
                }else{
                    logger.warn(`该用户[${feishuPeople._id}]的部门飞书群不存在`)
                    data.receive_id_type = "user_id"
                    data.receive_id = feishuPeople._lark_user_id;
                }
            } else {
                data.receive_id_type = "user_id"
                data.receive_id = feishuPeople._lark_user_id;
            }
            messageCardSendDatas.push(data);
        }
    }
    //创建限流器
    const limitedsendFeishuMessage = createLimiter(sendFeishuMessage);
    //发送飞书卡片消息
    logger.info(`任务定期提醒数量:${messageCardSendDatas.length}`);
    const sendFeishuMessageResults = await Promise.all(messageCardSendDatas.map(messageCardSendData => limitedsendFeishuMessage(messageCardSendData)));
    const sendFeishuMessageSuccess = sendFeishuMessageResults.filter(result => result.code === 0);
    const sendFeishuMessageFail = sendFeishuMessageResults.filter(result => result.code !== 0);
    logger.info(`任务定期提醒成功数量: ${sendFeishuMessageSuccess.length}, 失败数量: ${sendFeishuMessageFail.length}`);
    return {
        code: 0,
        message: `任务定期提醒成功数量: ${sendFeishuMessageSuccess.length}, 失败数量: ${sendFeishuMessageFail.length}`
    }
}
const sendFeishuMessage = async (messageCardSendData) => {
    try {
        await faas.function('MessageCardSend').invoke(messageCardSendData);
        return {code: 0, message: `飞书消息发送成功`, result: 'success'};
    } catch (error) {
        return {code: -1, message: error.message, result: 'failed'};
    }
};
