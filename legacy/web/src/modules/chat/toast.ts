import { message } from '../../custom-ui';

export const toast = {
  success: (msg: string) => message.success(msg),
  error: (msg: string) => message.error(msg),
  info: (msg: string) => message.info(msg),
  warning: (msg: string) => message.warning(msg),
};
