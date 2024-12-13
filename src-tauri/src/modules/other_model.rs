use core::fmt;

use serde::{Deserialize, Serialize};
use template_matching::Extremes;

#[derive(Serialize, Deserialize, std::fmt::Debug)]
pub struct Response<T = String>
where
    T: Serialize + std::fmt::Debug,
{
    pub status: u32,
    pub data: Option<T>,
    pub message: Option<String>,
}

impl<T> Response<T>
where
    T: Serialize + std::fmt::Debug,
{
    pub fn new_result(
        status: u32,
        data: Option<T>,
        message: Option<String>,
    ) -> Result<String, String> {
        // Self { status, data, message };
        if status == 1 {
            serde_json::to_string(&Self {
                status,
                data,
                message,
            })
            .map_err(|e| format!("success: {}", e))
        } else {
            serde_json::to_string(&Self {
                status,
                data,
                message,
            })
            .map_err(|e| format!("fail: {}", e))
        }
    }

    pub fn new(status: u32, data: Option<T>, message: Option<String>) -> Self {
        Self {
            status,
            data,
            message,
        }
    }
}
