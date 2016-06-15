var querystring = require('qs');
var https = require('https');
var request = require('request');

/**
 * Register permissions.
 */
iris.modules.auth.globals.registerPermission("can administer github auth", "Auth", "Can administer Github Authentication");

/**
 * Define routes.
 */
var routes = {
  auth: {
    "title": "Github Auth",
    "description": "Pull your version controlled changes to the live branch",
  },
  settings: {
    "title": "Github Authentication settings",
    "description": "Administer settings for Github authentication",
    "permissions": ["can administer github auth"],
    "menu": [{
      menuName: "admin_toolbar",
      parent: "/admin/users",
      title: "Github Authentication"
    }],
  }
};

/**
 * Page callback: Github callback
 */
iris.route.get("/github-callback", routes.auth, function (req, res) {

  // Get saved config.
  var config = iris.readConfigSync('irisGithubAuth', 'settings');

  if (config && config.clientid) {
    var clientId = config.clientid;
    var clientSecret = config.clientsecret;
    var appId = config.appid;
  }
  else {
    iris.log("error", "Github callback accessed without saved credentials.");
    iris.message(req.authPass.t("Github callback accessed without saved credentials."), "danger");
    res.redirect('/');
    return;
  }

  var finished = function(success) {

    if(success) {

      res.redirect('/user');

    }
    else {

      res.redirect('/user/login');

    }

  }

  var sessionCode = req.query.code;

  // Build the post string from an object
  var postData = querystring.stringify({
    'client_id': clientId,
    'client_secret': clientSecret,
    'code': sessionCode,
  });

  // Get access token.
  request.post({
      'url': 'https://github.com/login/oauth/access_token',
      'form': postData,
      'json': true
    },
    function (error, response, body) {

      if (!error && response.statusCode == 200) {
        res.cookie('github-auth', body);

        //get user email
        request.get({
            'url': 'https://api.github.com/user/emails?access_token=' + body.access_token,
            'headers': {
              'User-Agent': appId
            }
          },
          function (error, response, emails) {
      
            if (!error && response.statusCode == 200) {
          
              emails = JSON.parse(emails);

              for (var i = 0; i < emails.length; i++) {

                if (emails[i].primary == true) {

                  var email = emails[i].email;

                  // Check if account exists.
                  iris.dbCollections['user'].find({
                    'username' : email}
                  ).exec(function (err, entities) {

                    if (entities.length > 0) {

                      // User exists so login.
                      iris.modules.irisjsGithubAuth.globals.login(entities[0], body.access_token, res, finished);

                    }
                    else {

                      // New user so register.
                      iris.modules.irisjsGithubAuth.globals.register(email, body.access_token, res, finished);

                    }

                  });

                }

              };
            }

         });
      }
    }
  );

});

/**
 * Page callback: Settings page.
 */

iris.route.get('/admin/users/github', routes.settings, function (req, res) {

  iris.modules.frontend.globals.parseTemplateFile(["githubsettings"], ['admin_wrapper'], {
    'current': req.irisRoute.options,
  }, req.authPass, req).then(function (success) {

    res.send(success);

  }, function (fail) {

    iris.modules.frontend.globals.displayErrorPage(500, req, res);

    iris.log("error", fail);

  });
});

/**
 * Function to register a newly authenticated user.
 */
iris.modules.irisjsGithubAuth.globals.register = function (email, token, res, callback) {

  var newUser = {
    entityType: "user",
    entityAuthor: "system",
    password: token,
    username: email,
    roles: [],
    githubaccesstoken: token
  };

  // Create user entity.
  iris.invokeHook("hook_entity_create", "root", newUser, newUser).then(function (user) {

    var auth = {
      password: token,
      username: email
    };

    // Login.
    iris.modules.user.globals.login(auth, res, function (uid) {

      iris.message(uid, "New user account created with username: " + email + ". We recommend you change your Iris password to allow you to login directly in future.", "success");
      callback(true);

    });

  }, function(fail) {
 
    iris.log("error", fail);
    callback(fail);

  });

};

/**
 * Function to login an existing user.
 */
iris.modules.irisjsGithubAuth.globals.login = function (user, token, res, callback) {

  var userid = user.eid.toString();

  iris.invokeHook("hook_auth_maketoken", "root", null, {
    userid: userid
  }).then(function (token) {

      iris.modules.sessions.globals.writeCookies(userid, token.id, res, 8.64e7, {});

      // Add last login timestamp to user entity.
      iris.dbCollections['user'].update(
        {
          "eid": userid
        },
        {
          $set : {
            "lastlogin" : Date.now(),
            "githubaccesstoken" : token
          }
        },
        {},
        function(err, doc) {}
      );

    callback(true);

  }, function (fail) {

    iris.log("error", fail);
    callback(false);

  });

}

/**
 * Alter the default login form to add a 'Login with Github' link.
 */
iris.modules.irisjsGithubAuth.registerHook("hook_form_render__login", 2, function (thisHook, data) {

  var config = iris.readConfigSync('irisGithubAuth', 'settings')

  if (config && config.clientid) {

    var clientId = config.clientid;

    data.schema.github = {
      "type": "markup",
      "markup": '<a href="https://github.com/login/oauth/authorize?scope=user:email,repo&client_id=' + clientId + '">' + thisHook.authPass.t("Login with GitHub") + '</a>'
    };

    data.form.push('github');

  }

  thisHook.pass(data);

});

/**
 * Defines form githubAuthSettings.
 * General settings for Github authentication.
 */
iris.modules.irisjsGithubAuth.registerHook("hook_form_render__githubAuthSettings", 0, function (thisHook, data) {

  var generateForm = function(config) {

    data.schema.clientid = {
      "type" : "text",
      "title" : "Client ID",
      "default" : config.clientid ? config.clientid : ''
    };

    data.schema.clientsecret = {
      "type" : "text",
      "title" : "Client Secret",
      "default" : config.clientsecret ? config.clientsecret : ''
    };

    thisHook.pass(data);

  }

  iris.readConfig('irisGithubAuth', 'settings').then(function (config) {

    generateForm(config);

  }, function (fail) {

    generateForm(false);

  });

});

/**
 * Submit handler for githubAuthSettings.
 */
iris.modules.irisjsGithubAuth.registerHook("hook_form_submit__githubAuthSettings", 0, function (thisHook, data) {

  iris.saveConfig(thisHook.context.params, 'irisGithubAuth', 'settings');

  data.messages.push({
    "type": "info",
    "message": "Successfully saved"
  });

  thisHook.pass(data);

});

/**
 * Implements dbReady.
 * Adds the githubaccesstoken field to the user entity after this module is enabled.
 */
 
process.on("dbReady", function(){
   
  if (iris.modules.irisjsGithubAuth) {

    // Fetch current schema
    var schema = iris.entityTypes['user'];

    if (Object.keys(schema.fields).indexOf('githubAccessToken') <= 0) {

      schema.fields.githubaccesstoken = {
        "description": "Access token for authenticating with Github",
          "fieldType": "Textfield",
          "label": "Github Access Token",
          "machineName": "githubaccesstoken",
          "permissions": [],
          "required": false,
          "unique": false
      };

      // Save updated schema.
      iris.saveConfig(schema, "entity", 'user', function (data) {

      });

    }


  }
  
});