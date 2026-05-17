import { v4 as uuidv4 } from 'uuid'

export const generateId = (prefix) => `${prefix}-${uuidv4()}`