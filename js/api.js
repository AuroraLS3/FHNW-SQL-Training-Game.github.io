LoginStatus = {
  LOGGED_OUT: 0,
  LOGGED_IN: 1,
  ERRORED: 2,
};

class PreviousAnswer {
  constructor({ correct, query, date, task }) {
    this.correct = correct;
    this.query = query;
    this.date = date.split("T").join(" ");
    this.task = task;
  }

  render(selected) {
    return `<button class="dropdown-item${selected ? " selected" : ""}" role="option" data-query="${
      this.query
    }" onclick="Views.TASK.selectPreviousAnswer(event)">
            ${
              this.correct
                ? `<i class="fa fa-fw fa-check col-green" aria-label="${i18n.get("correct")}"></i>`
                : `<i class="fa fa-fw fa-times col-red" aria-label="${i18n.get("incorrect")}"></i>`
            } ${this.date}
        </button>`;
  }
}

const API = {
  ADDRESS: "http://localhost:4000",
  loginStatus: LoginStatus.LOGGED_OUT,
  token: undefined,
  username: undefined,
  cachedAnswerData: {
    loading: false,
    loaded: false,
    data: undefined,
  },
  loginExisting() {
    const sessionToken = sessionStorage.getItem("fhnw-token");
    const username = sessionStorage.getItem("fhnw-username");
    if (sessionToken) {
      this.loginStatus = LoginStatus.LOGGED_IN;
      this.token = sessionToken;
      API.username = username;
    }
  },
  login(username, password) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.onreadystatechange = function () {
        if (this.readyState === 4) {
          if (xhr.status === 200) {
            const responseJson = JSON.parse(this.response);
            const username = responseJson.user.username;
            const token = responseJson.token;
            API.loginStatus = LoginStatus.LOGGED_IN;
            sessionStorage.setItem("fhnw-username", username);
            sessionStorage.setItem("fhnw-token", token);
            API.username = username;
            API.token = token;
            resolve();
          } else if (xhr.status === 400) {
            API.loginStatus = LoginStatus.ERRORED;
            reject(i18n.get("incorrect-login"));
          } else {
            API.loginStatus = LoginStatus.ERRORED;
            reject(`Bad response code '${xhr.status}' for login`);
          }
        }
      };
      xhr.open("POST", `${this.ADDRESS}/users/authenticate`, true);
      xhr.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
      xhr.send(`username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`);
    });
  },
  logout() {
    this.loginStatus = LoginStatus.LOGGED_OUT;
    this.token = "";
    this.username = "";
    sessionStorage.removeItem("fhnw-token");
    sessionStorage.removeItem("fhnw-username");
  },
  quizzesStatus() {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.onreadystatechange = function () {
        if (this.readyState === 4) {
          if (this.status === 200) {
            var jsonObj = JSON.parse(this.response);
            resolve(this.responseText.split(" ").map((result) => parseInt(result) === 1));
          } else {
            reject(`Bad response code '${xhr.status}' for API query`);
          }
        }
      };
      xhr.open("GET", `${this.ADDRESS}/users/self`, true);
      xhr.setRequestHeader("Authorization", "Bearer " + this.token);
      xhr.send();
    });
  },
  async fetchCompletedTaskIDs(override) {
    const taskStatus = await this.quizzesStatus();
    const completedTaskIDs = [];
    let i = 0;
    for (let task of tasks.asList()) {
      if (taskStatus[task.getNumericID() - 1] || i < override) {
        completedTaskIDs.push(task.id);
      }
      i++;
    }
    return completedTaskIDs;
  },
  async quizzesSendRetryOnFail(task, sql, result, attempt) {
    try {
      await this.quizzesSend(task, sql, result);
    } catch (e) {
      if (attempt <= 3) {
        await this.quizzesSendRetryOnFail(task, sql, result, attempt + 1);
      } else {
        showError("Failed to send answer to server, " + e);
      }
    }
  },
  quizzesSend(task, sql, result) {
    this.cachedAnswerData.loaded = false;
    const taskID = task.getNumericID();
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.onreadystatechange = function () {
        if (this.readyState === 4) {
          if (this.status === 200) {
            resolve();
          } else {
            reject(`Bad response code '${xhr.status}' for quizzes send`);
          }
        }
      };
      xhr.open("POST", `${this.ADDRESS}/sql_send.php`, true);
      xhr.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
      xhr.send(`token=${this.token}&task=${taskID}&result=${result ? 1 : 0}&data=${encodeURIComponent(sql)}&course=2`);
    });
  },
  quizzesAnswer(task) {
    const taskID = task.getNumericID();
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.onreadystatechange = function () {
        if (this.readyState === 4) {
          if (this.status === 200) {
            resolve(this.responseText);
          } else {
            reject(`Bad response code '${xhr.status}' for quizzes answer`);
          }
        }
      };
      xhr.open("GET", `${this.ADDRESS}/sql_answer.php?token=${this.token}&task=${taskID}&course=2`, true);
      xhr.send();
    });
  },
  quizzesAllHistory() {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.onreadystatechange = function () {
        if (this.readyState === 4) {
          if (this.status === 200) {
            const text = this.responseText;
            if (!text) {
              resolve([]);
            } else {
              resolve(JSON.parse(text).map((entry) => new PreviousAnswer(entry)));
            }
          } else {
            reject(`Bad response code '${xhr.status}' for quizzes answer`);
          }
        }
      };
      xhr.open("GET", `${this.ADDRESS}/sql_history.php?token=${this.token}&course=2`, true);
      xhr.send();
    });
  },
  quizzesTaskHistory(task) {
    const taskID = task.getNumericID();
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.onreadystatechange = function () {
        if (this.readyState === 4) {
          if (this.status === 200) {
            resolve(JSON.parse(this.responseText).map((entry) => new PreviousAnswer(entry)));
          } else {
            reject(`Bad response code '${xhr.status}' for quizzes answers`);
          }
        }
      };
      xhr.open("GET", `${this.ADDRESS}/sql_history.php?token=${this.token}&task=${taskID}&course=2`, true);
      xhr.send();
    });
  },
  async quizzesAllPastAnswers() {
    await awaitUntil(() => !this.cachedAnswerData.loading); // Syncs multiple calls to this func.
    if (this.cachedAnswerData.loaded) {
      return this.cachedAnswerData.data;
    }
    this.cachedAnswerData.loading = true;

    const answers = await this.quizzesAllHistory();

    const byID = {};
    answers.forEach((answer) => {
      if (!byID[answer.task]) byID[answer.task] = [];
      byID[answer.task].push(answer);
    });

    const data = [];
    for (let entry of Object.entries(byID)) {
      data.push({ id: entry[0], answers: entry[1] });
    }
    this.cachedAnswerData.data = data;
    this.cachedAnswerData.loaded = true;
    this.cachedAnswerData.loading = false;

    return data;
  },
  quizzesModel(task) {
    const taskID = task.getNumericID();
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.onreadystatechange = function () {
        if (this.readyState === 4) {
          if (this.status === 200) {
            resolve(this.responseText);
          } else {
            reject(`Bad response code '${xhr.status}' for quizzes model`);
          }
        }
      };
      xhr.open("GET", `${this.ADDRESS}/sql_model.php?token=${this.token}&task=${taskID}&course=2`, true);
      xhr.send();
    });
  },
};
