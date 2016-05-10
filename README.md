# Github authentication for IrisJS

## Description
Allow users to register and login using their existing Github accounts.
This can be extended to provide full Github integration for repo management, commiting, push/pulling etc.
Related module: irisjs-editor

## Installation

1. In your project directory run 'npm install irisjs-githubauth'
2. Set appropriate permissions.
3. Add your Github application Client Id and Client Secret at /admin/users/github.

## How to use

This module adds a 'Login with Github' link to the user login form. This will direct the user to Github where they
will be asked to authenticate against your application. Upon authenticating, they will be redirected to your site and
automatically logged in. If their verified Github email does not exist as the username for any Iris user entities,
a new user account will be created.

After authenticating, their github access token will be saved to their Iris user entity in property 'githubaccesstoken'
which can then be used later if required.