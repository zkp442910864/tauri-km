use serde::Serialize;

/// 推送日志到前端（当前仅序列化，待实现前端通信）
pub fn push_web_log(data: WebLog) {
    let json = serde_json::to_string(&data);
    if let Ok(val) = json {
        // 发送到web上
    }
}

/// Web 日志数据结构 —— 用于将 Rust 端日志推送到前端显示。
///
/// 支持普通日志、标题日志、错误日志三种类型。
#[derive(Serialize)]
pub struct WebLog<'a> {
    msg: &'a str,
    msg_arr: Vec<&'a str>,
    is_err: bool,
    is_title: bool,
}

impl<'a> WebLog<'a> {
    pub fn new(msg: &'a str, is_err: bool, is_title: bool) -> Self {
        WebLog {
            msg,
            is_err,
            is_title,
            msg_arr: vec![],
        }
    }

    pub fn new_default(msg: &'a str) -> Self {
        WebLog {
            msg,
            is_err: false,
            is_title: false,
            msg_arr: vec![],
        }
    }

    pub fn new_title(msg: &'a str) -> Self {
        WebLog {
            msg,
            is_err: false,
            is_title: true,
            msg_arr: vec![],
        }
    }

    pub fn new_error(msg: &'a str) -> Self {
        WebLog {
            msg,
            is_err: true,
            is_title: false,
            msg_arr: vec![],
        }
    }

    pub fn with_msg_arr(mut self, msg_arr: Vec<&'a str>) -> Self {
        self.msg_arr = msg_arr;
        self
    }
}
