module.exports = {
  apps: [
    {
      name: "chunkly-api",
      script: "./index.js",
      instances: 1, // Change to "max" or an integer for cluster mode if instance is scaled
      exec_mode: "fork",
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 8080
      }
    },
    {
      name: "chunkly-file-worker",
      script: "./workers/file-understanding.worker.js",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
