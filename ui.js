$(async function() {
  // cache some selectors we'll be using quite a bit
  const $allStoriesList = $("#all-articles-list");
  const $submitForm = $("#submit-form");
  const $favoritedArticles = $("#favorited-articles");
  const $filteredArticles = $("#filtered-articles");
  const $loginForm = $("#login-form");
  const $createAccountForm = $("#create-account-form");
  const $ownStories = $("#my-articles");
  const $navLogin = $("#nav-login");
  const $navLogOut = $("#nav-logout");
  const $navWelcome = $('#nav-welcome');
  const $userProfile = $('#user-profile');
  const $profileName = $('#profile-name span');
  const $profileUsername = $('#profile-username span');
  const $profileAccountDate = $('#profile-account-date span');



  // global storyList variable
  let storyList = null;

  // global currentUser variable
  let currentUser = null;

  await checkIfLoggedIn();

  /**
   * Event listener for logging in.
   *  If successful we will setup the user instance
   */

  $loginForm.on("submit", async function(evt) {
    evt.preventDefault(); // no page-refresh on submit

    // grab the username and password
    const username = $("#login-username").val();
    const password = $("#login-password").val();

    // call the login static method to build a user instance
    const userInstance = await User.login(username, password);
    // set the global user to the user instance
    currentUser = userInstance;
    buildUserProfile();
    buildUserStories();
    syncCurrentUserToLocalStorage();
    loginAndSubmitForm();
  });

  /**
   * Event listener for submitting a story.
   *  Will add a new story to the home list, my stories list, and the user instance
   */
  
  $submitForm.on("submit", async function(evt) {
    evt.preventDefault(); // no page-refresh on submit

    // grab the author, title, and url
    const author = $("#author").val();
    const title = $("#title").val();
    const url = $("#url").val();

    // call the submit static method to post a new story
    const newStory = await StoryList.addStory(currentUser, {author, title, url});
    // add the new story to the current users' list of stories
    currentUser.ownStories.push(newStory);
    // update story list and my stories list
    await generateStories();
    buildUserStories();
    $ownStories.find('h5').remove();
    // reset the form
    $submitForm.trigger("reset").hide();
  });

  /**
   * Event listener for signing up.
   *  If successfully we will setup a new user instance
   */

  $createAccountForm.on("submit", async function(evt) {
    evt.preventDefault(); // no page refresh

    // grab the required fields
    let name = $("#create-account-name").val();
    let username = $("#create-account-username").val();
    let password = $("#create-account-password").val();

    // call the create method, which calls the API and then builds a new user instance
    const newUser = await User.create(username, password, name);
    currentUser = newUser;
    syncCurrentUserToLocalStorage();
    loginAndSubmitForm();
  });

  /**
   * Log Out Functionality
   */

  $navLogOut.on("click", function() {
    // empty out local storage
    localStorage.clear();
    // refresh the page, clearing memory
    location.reload();
  });

  /**
   * Event Handler for Clicking Login
   */

  $navLogin.on("click", function() {
    // Show the Login and Create Account Forms
    $loginForm.slideToggle();
    $createAccountForm.slideToggle();
    $allStoriesList.toggle();
  });

  /**
   * Event handler for Navigation to Homepage
   */

  $("body").on("click", "#nav-all", async function() {
    hideElements();
    await generateStories();
    $allStoriesList.show();
  });
  
  /**
   * Event handlers for user menu links
   */

  $('.main-nav-links a, #nav-user-profile').on("click", function(e) {
    hideElements();
    // Show the Submit Story Form
    if(e.target.id === 'nav-submit') {
      $submitForm.slideDown();
      $allStoriesList.show();
    }
    if(e.target.id === 'nav-favorites') $favoritedArticles.show();
    if(e.target.id === 'nav-my-stories') $ownStories.show();
    if(e.target.id === 'nav-user-profile') $userProfile.show();
  });

  /**
   * Event handler for star and trash icons
   */

  $('body').on("click", async function(e) {
    if(currentUser) {
      let $this = $(e.target);
      let storyId = $this.closest('li').attr('id');
      //if clicked on an empty star to favorite
      if($this.hasClass('far')) { 
        $favoritedArticles.find('h5').remove();
        $ownStories.find(`#${storyId} .far`).toggleClass('far fas');
        $allStoriesList.find(`#${storyId} .far`).toggleClass('far fas');
        const favedStory = await currentUser.addFavorite(storyId);
        const result = generateStoryHTML(favedStory);
        $favoritedArticles.append(result);
  
      }
      //if clicked on a filled star to unfavorite
      else if($this.hasClass('fas')) { 
        $this.toggleClass('far fas');
        $favoritedArticles.find(`#${storyId}`).remove();
        await currentUser.deleteFavorite(storyId);
        checkForEmptyLists();
      }
      //if clicked on the trash can to delete
      if($this.hasClass('fa-trash-alt')) {
        $this.closest('li').remove();
        await currentUser.deleteStory(storyId);
        checkForEmptyLists();
      }
    }
  });

  /**
   * On page load, checks local storage to see if the user is already logged in.
   * Renders page information accordingly.
   */

  async function checkIfLoggedIn() {
    // let's see if we're logged in
    const token = localStorage.getItem("token");
    const username = localStorage.getItem("username");

    // if there is a token in localStorage, call User.getLoggedInUser
    //  to get an instance of User with the right details
    //  this is designed to run once, on page load
    currentUser = await User.getLoggedInUser(token, username);
    await generateStories();

    if (currentUser) {
      buildUserProfile();
      buildUserStories();
      showNavForLoggedInUser();
    }
  }

  /**
   * A rendering function to run to reset the forms and hide the login info
   */

  function loginAndSubmitForm() {
    // hide the forms for logging in and signing up
    $loginForm.hide();
    $createAccountForm.hide();

    // reset those forms
    $loginForm.trigger("reset");
    $createAccountForm.trigger("reset");

    // show the stories
    $allStoriesList.show();

    // update the navigation bar
    showNavForLoggedInUser();
  }

  //Add filler text for when the favorite list or my stories list are empty
  function checkForEmptyLists() {
    if($ownStories.children().length === 0) $ownStories.append($('<h5>No stories added by user yet!</h5>'));
    if($favoritedArticles.children().length === 0) $favoritedArticles.append($('<h5>No favorites added!</h5>'));
  }

  /**
   * A rendering function to call the StoryList.getStories static method,
   *  which will generate a storyListInstance. Then render it.
   */

  async function generateStories() {
    // get an instance of StoryList
    const storyListInstance = await StoryList.getStories();
    // update our global variable
    storyList = storyListInstance;
    // empty out that part of the page
    $allStoriesList.empty();

    // loop through all of our stories and generate HTML for them
    for (let story of storyList.stories) {
      const result = generateStoryHTML(story);
      $allStoriesList.append(result);
    }
  }

  /**
   * A function to render HTML for an individual Story instance
   */

  function generateStoryHTML(story) {
    let hostName = getHostName(story.url);
    let faved = false;
    if(currentUser) {
      let arr = currentUser.favorites;
      //checks to see if current story is in favorite stories list, returns true if it is
      faved = arr.some( favedStory => {return favedStory.storyId === story.storyId});
    }
    // render story markup
    const storyMarkup = $(`
      <li id="${story.storyId}">
        <span class="star">
          <i class="${faved ? "fas" : "far"} fa-star"></i>
        </span>
        <a class="article-link" href="${story.url}" target="a_blank">
          <strong>${story.title}</strong>
        </a>
        <small class="article-author">by ${story.author}</small>
        <small class="article-hostname ${hostName}">(${hostName})</small>
        <small class="article-username">posted by ${story.username}</small>
      </li>
    `);

    return storyMarkup;
  }

  function buildUserStories() {
    $favoritedArticles.empty();
    $ownStories.empty();
    // loop through all of our favorited stories and generate HTML for them
    for (let story of currentUser.favorites) {
      const result = generateStoryHTML(story);
      $favoritedArticles.append(result);
    }
    // loop through all of my stories and generate HTML for them
    for (let story of currentUser.ownStories) {
      const result = generateStoryHTML(story);
      result.prepend($(`
        <span class="trash-can">
          <i class="fas fa-trash-alt"></i>
        </span>`))
      $ownStories.append(result);
    }
  }

  function buildUserProfile() {
    $profileName.text(currentUser.name);
    $profileUsername.text(currentUser.username);
    $profileAccountDate.text(currentUser.createdAt);
  }

  /* hide all elements in elementsArr */

  function hideElements() {
    const elementsArr = [
      $submitForm,
      $allStoriesList,
      $favoritedArticles,
      $filteredArticles,
      $ownStories,
      $userProfile,
      $loginForm,
      $createAccountForm
    ];
    elementsArr.forEach($elem => $elem.hide());
  }

  function showNavForLoggedInUser() {
    $navWelcome.find('a').text(currentUser.username);
    $navLogin.hide();
    $navLogOut.show();
    $navWelcome.show();
    $('.main-nav-links').show();
    checkForEmptyLists();
  }

  /* simple function to pull the hostname from a URL */

  function getHostName(url) {
    let hostName;
    if (url.indexOf("://") > -1) {
      hostName = url.split("/")[2];
    } else {
      hostName = url.split("/")[0];
    }
    if (hostName.slice(0, 4) === "www.") {
      hostName = hostName.slice(4);
    }
    return hostName;
  }

  /* sync current user information to localStorage */

  function syncCurrentUserToLocalStorage() {
    if (currentUser) {
      localStorage.setItem("token", currentUser.loginToken);
      localStorage.setItem("username", currentUser.username);
    }
  }
});
