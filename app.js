const express = require("express");
const path = require("path");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const getUserQuery = `
  SELECT
    *
  FROM
    user
  WHERE
    username = '${username}';`;
  const userDetails = await db.get(getUserQuery);
  if (userDetails === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const addUserQuery = `
      INSERT INTO
        user (name, username, password, gender)
      VALUES
        (
          "${name}",
          "${username}",
          "${hashedPassword}",
          "${gender}"
        );`;
      addUser = await db.run(addUserQuery);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserQuery = `
  SELECT
    *
  FROM
    user
  WHERE
    username = '${username}';`;
  const userDetails = await db.get(getUserQuery);
  if (userDetails === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const passwordAuthentication = await bcrypt.compare(
      password,
      userDetails.password
    );
    if (passwordAuthentication) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getUserDetails = `
  SELECT
    *
  FROM
    user
  WHERE
    username = '${username}';`;
  const userDetails = await db.get(getUserDetails);
  const getTweetQuery = `
  SELECT
    userFollower.username AS username,
    tweet.tweet AS tweet,
    date_time AS dateTime
  FROM
    (user INNER JOIN follower ON
    user.user_id = follower.following_user_id) AS userFollower
    INNER JOIN tweet ON
    userFollower.user_id = tweet.user_id
  WHERE
    follower.follower_user_id = ${userDetails.user_id} 
  ORDER BY
    dateTime DESC
  LIMIT 4;`;
  const getTweet = await db.all(getTweetQuery);
  response.send(getTweet);
});

app.get("/user/following/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getUserDetails = `
  SELECT
    *
  FROM
    user
  WHERE
    username='${username}';`;
  const userDetails = await db.get(getUserDetails);
  const getTweetQuery = `
  SELECT
    name
  FROM
    user INNER JOIN follower ON
    user.user_id = follower.following_user_id
  WHERE
    follower.follower_user_id = ${userDetails.user_id};`;
  const getTweet = await db.all(getTweetQuery);
  response.send(getTweet);
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getUserDetails = `
  SELECT
    *
  FROM
    user
  WHERE
    username = '${username}';`;
  const userDetails = await db.get(getUserDetails);
  const getTweetQuery = `
  SELECT
    name
  FROM
    user INNER JOIN follower ON
    user.user_id = follower.follower_user_id
  WHERE
    follower.following_user_id = ${userDetails.user_id};`;
  const getTweet = await db.all(getTweetQuery);
  response.send(getTweet);
});

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  let { username } = request;
  const getUserDetails = `
  SELECT
    *
  FROM
    user
  WHERE
    username = '${username}';`;
  const userDetails = await db.get(getUserDetails);
  const getFollowerQuery = `
  SELECT
    follower.following_user_id AS user_id
  FROM
    follower INNER JOIN tweet ON
    follower.following_user_id = tweet.user_id
  WHERE
    follower.follower_user_id = ${userDetails.user_id} AND
    tweet.tweet_id = ${tweetId};`;
  const followerDetails = await db.get(getFollowerQuery);
  if (followerDetails === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const getTweetQuery = `
    SELECT
      userLike.tweet AS tweet,
      count(distinct userLike.like_id) AS likes,
      count(distinct reply.reply_id) AS replies,
      userLike.date_time AS dateTime
    FROM
      (tweet INNER JOIN like ON
      tweet.tweet_id = like.tweet_id) AS userLike
      INNER JOIN reply ON
      userLike.tweet_id = reply.tweet_id
    WHERE
      userLike.tweet_id = ${tweetId}
    GROUP BY
      userLike.tweet_id;`;
    const getTweet = await db.get(getTweetQuery);
    response.send(getTweet);
  }
});

app.get(
  "/tweets/:tweetId/likes",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    let { username } = request;
    const getUserDetails = `
    SELECT
      *
    FROM
      user
    WHERE
      username='${username}';`;
    const userDetails = await db.get(getUserDetails);
    const getFollowerQuery = `
    SELECT
      follower.following_user_id AS user_id
    FROM
      follower INNER JOIN tweet ON
      follower.following_user_id = tweet.user_id
    WHERE
      follower.follower_user_id = ${userDetails.user_id} AND
      tweet.tweet_id = ${tweetId};`;
    const followerDetails = await db.get(getFollowerQuery);
    if (followerDetails === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getTweetQuery = `
      SELECT
        *
      FROM
        like INNER JOIN user ON
        like.user_id = user.user_Id
      WHERE
        like.tweet_id = ${tweetId};`;
      const getTweet = await db.all(getTweetQuery);
      console.log(getTweet);
      let userArray = [];
      const likeObject = getTweet.map((each) => {
        userArray.push(each.username);
      });
      response.send({ likes: userArray });
    }
  }
);

app.get(
  "/tweets/:tweetId/replies",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    let { username } = request;
    const getUserDetails = `
    SELECT
      *
    FROM
      user
    WHERE
      username='${username}';`;
    const userDetails = await db.get(getUserDetails);
    const getFollowerQuery = `
    SELECT
      follower.following_user_id AS user_id
    FROM
      follower INNER JOIN tweet ON
      follower.following_user_id = tweet.user_id
    WHERE
      follower.follower_user_id = ${userDetails.user_id} AND
      tweet.tweet_id = ${tweetId};`;
    const followerDetails = await db.get(getFollowerQuery);
    if (followerDetails === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getTweetQuery = `
      SELECT
        user.name,
        reply.reply
      FROM
        reply INNER JOIN user ON
        reply.user_id = user.user_Id
      WHERE
        reply.tweet_id = ${tweetId};`;
      const getTweet = await db.all(getTweetQuery);
      let userArray = [];
      const likeObject = getTweet.map((each) => {
        userArray.push({ name: each.name, reply: each.reply });
      });
      response.send({ replies: userArray });
    }
  }
);

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserDetails = `
  SELECT
    *
  FROM
    user
  WHERE
    username='${username}';`;
  const userDetails = await db.get(getUserDetails);
  const getTweetQuery = `
  SELECT
    userLike.tweet AS tweet,
    count(distinct userLike.like_id) AS likes,
    count(distinct reply.reply_id) AS replies,
    userLike.date_time AS dateTime
  FROM
    (tweet INNER JOIN like ON
    tweet.tweet_id=like.tweet_id) AS userLike
    INNER JOIN reply ON
    userLike.tweet_id = reply.tweet_id
    WHERE
      userLike.user_id = ${userDetails.user_id}
  GROUP BY
    userLike.tweet_id;`;
  const tweetDetails = await db.all(getTweetQuery);
  response.send(tweetDetails);
});

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const { tweet } = request.body;
  const getUserDetails = `
  SELECT
    *
  FROM
    user
  WHERE
    username='${username}';`;
  const userDetails = await db.get(getUserDetails);
  const addTweetQuery = `
  INSERT INTO
    tweet (tweet ,user_id)
  VALUES
  (
    '${tweet}',${userDetails.user_id}
  );`;
  await db.run(addTweetQuery);
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    //console.log(tweetId);
    let { username } = request;
    const getUserIdQuery = `select user_id from user where username='${username}';`;
    const getUserId = await db.get(getUserIdQuery);
    //console.log(getUserId.user_id);
    //tweets made by the user
    const getUserTweetsListQuery = `select tweet_id from tweet where user_id=${getUserId.user_id};`;
    const getUserTweetsListArray = await db.all(getUserTweetsListQuery);
    const getUserTweetsList = getUserTweetsListArray.map((eachTweetId) => {
      return eachTweetId.tweet_id;
    });
    console.log(getUserTweetsList);
    if (getUserTweetsList.includes(parseInt(tweetId))) {
      const deleteTweetQuery = `delete from tweet where tweet_id=${tweetId};`;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
