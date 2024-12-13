use serde::Serialize;

pub fn push_web_log(data: WebLog) {
    let json = serde_json::to_string(&data);
    if let Ok(val) = json {
        // 发送到web上
    }
}

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
