angular.module('lineup-planner', ['ui.router', 'ui.bootstrap', 'firebaseHelper'])
	
	.run(function(){
		FastClick.attach(document.body);
	})
	
	.config(["$urlRouterProvider", "$stateProvider", "$firebaseHelperProvider", function($urlRouterProvider, $stateProvider, $firebaseHelperProvider){
		// routing
		$urlRouterProvider.when('',  '/');
		$stateProvider
			// pages
			.state('edit', {
				url: '/:event/edit',
				templateUrl: 'views/edit.html',
			})
			.state('event', {
				url: '/:event',
				templateUrl: 'views/event.html',
			})
				.state('group', {
					parent: 'event',
					url: '/:group',
				});
		
		// data
		$firebaseHelperProvider.namespace('lineup-planner');
	}])
	
	.factory('Auth', ["$firebaseHelper", function($firebaseHelper){
		return $firebaseHelper.auth();
	}])
	.controller('AppCtrl', ["$rootScope", "$state", "$firebaseHelper", "Auth", function($rootScope, $state, $firebaseHelper, Auth){
		$rootScope.$state = $state;
		
		// auth
		var refreshAuthState = function(){
			if( ! $rootScope.$me || ! $rootScope.$me.$loaded) return;
			
			$rootScope.$me.$loaded().then(function(me){
				// check if user is already in a group for this event, and redirect there if so
				if($state.params.event && me.groups && me.groups[$state.params.event] && ! $state.params.group && $state.current.name != 'edit'){
					// determine default group (first one this event they are a member of)
					$rootScope.$me.$defaultGroup = false;
					angular.forEach(me.groups[$state.params.event], function(group_id){
						if($rootScope.$me.$defaultGroup) return;
						$rootScope.$me.$defaultGroup = group_id;
					});
					
					// redirect
					$state.go('group', {event: $state.params.event, group: $rootScope.$me.$defaultGroup});
				}
			});
		};
		$rootScope.$me = {};
		$rootScope.$unauth = Auth.$unauth;
		Auth.$onAuth(function(authData){
			if(authData){
				// logging in
				$rootScope.$me = $firebaseHelper.object('users/' + authData.uid); // fetch existing user profile
				$rootScope.$me.$ref().update(authData); // update it w/ any changes since last login
				refreshAuthState();
			}else{
				// page loaded or refreshed while not logged in, or logging out
				$rootScope.$me = {};
			}
		});
		$rootScope.$authThen = function(callback){
			if ( ! $rootScope.$me.uid){
				Auth['$authWithOAuth' + (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ? 'Redirect' : 'Popup')]('facebook').then(function(authData){
					if(angular.isFunction(callback)) callback(authData.uid);
				}, function(error){
					console.error(error);
				});
			}else{
				if(angular.isFunction(callback)) callback();
			}
		};
		
		// data
		$rootScope.events = $firebaseHelper.array('events');
		$rootScope.$on('$stateChangeSuccess', function(){
			if($state.params.event){
				$rootScope.event = $firebaseHelper.object('events',$state.params.event);
				$rootScope.bands = $firebaseHelper.array('bands', $state.params.event);
				
				// filtering
				$rootScope.event.$loaded().then(function(event){
					$rootScope.eventId = $state.params.event;
					$rootScope.event.$days = ['All Days'];
					for(var i = 1; i <= event.days; i++) $rootScope.event.$days.push(i);
				});
				
				if($state.params.group){ // group is explicitly specified
					$rootScope.group = $firebaseHelper.object('groups/' + $state.params.event + '/' + $state.params.group);
					$rootScope.users = $firebaseHelper.join('groups/' + $state.params.event + '/' + $state.params.group + '/users', 'users');
				}else{ // no group explicitly specified
					$rootScope.group = $rootScope.users = undefined;
					
					refreshAuthState();
				}
			}else{
				// redirect to latest event if none specified
				$rootScope.events.$loaded().then(function(){
					$state.go('event', {event: $rootScope.events[$rootScope.events.length - 1].$id});
				});
			}
		});
		
		// constants
		$rootScope.rubrics = {
			'-1': "I would like to avoid this band.",
			'0':  "I don't really know this band…",
			'1':  "I would see this band.",
			'2':  "I need to see this band!",
		};
	}])
	.controller('EventsCtrl', ["$scope", "$firebaseHelper", "$state", function($scope, $firebaseHelper, $state){
		$scope.newEvent = function(){
			var name = prompt('What\'s the event name and year \n(e.g. "Funpalooza 2015")?');
			if(name){
				var slug = name.toLowerCase().replace(/[^a-z0-9-]/g,'-').replace(/-+/g,'-').replace(/^\-|\-$/g, '');
				
				// @TODO: what if event with this slug/name already exists? (!)
				$firebaseHelper.ref('events/' + slug).set({name: name}, function(){
					$state.go('edit', {event: slug});
				});
			}
		};
	}])
	.controller('BandsCtrl', ["$scope", "$firebaseHelper", function($scope, $firebaseHelper){
		// voting
		$scope.vote = function(band_id, vote){
			$scope.$authThen(function(uid){
				var $item = $firebaseHelper.object($scope.bands, band_id + '/votes/' + (uid || $scope.$me.uid) + '/vote'),
					ref   = $item.$ref();
				$item.$loaded().then(function(item){
					if(item.$value == vote){
						ref.remove();
					} else {
						ref.set(vote);
					}
				});
			});
		};
		
		// sorting
		$scope.filterDay   = 0;
		$scope.orderBy     = undefined;
		$scope.orderByStr  = undefined;
		$scope.orderByDir  = false;
		$scope.toggleOrder = function(key){
			if(key){
				var defaultOrderByDirs = {
					day: false,
					name: false,
					vote: true,
					score: true,
				};
				if($scope.orderByStr == key){ // already sorting by this key
					if($scope.orderByDir === defaultOrderByDirs[key]){ // we haven't yet flipped direction
						$scope.orderByDir = ! $scope.orderByDir; // flip direction
					}else{// we've already flipped direction
						// clear the sorting to default
						return $scope.toggleOrder();
					}
				}else{ // sorting by new key
					$scope.orderByDir = defaultOrderByDirs[key]; // sort by default direction
				}
			}
			
			$scope.orderByStr = key;
			
			switch(key){
				case 'vote':
					key = function(item){
						var order = -2;
						if(item.votes){
							angular.forEach(item.votes, function(vote, user_uid){
								if(user_uid == $scope.$me.uid) order = vote.vote;
							});
						}
						return order;
					};
					break;
				case undefined:
					$scope.orderBy    = ['day','$id'];
					$scope.orderByDir = false;
					return;
				case 'day':
					$scope.orderBy    = ['day','name'];
					return;
			}
			$scope.orderBy = key;
		};
		$scope.toggleOrder();
	}])
	.controller('BandCtrl', ["$scope", function($scope){
		$scope.init = function(band){
			$scope.data = band;
		};
		$scope.$watch('data.votes', function(votes){
			var total = 0;
			angular.forEach(votes, function(item){
				total += item.vote;
			});
			$scope.data = $scope.data || {};
			return $scope.data.score = total;
		});
		
		// editing
		$scope.add = function(band){
			if(band && band.name && band.day){
				$scope.bands.$add(band).then(function(){
					// reset it
					band.name = '';
					
					// focus on input so we can quickly add more
					$scope.added = true;
				});
			}else{
				console.error('Missing required field.');
			}
		};
		$scope.remove = function(band, skipConfirm){
			if(band && band.$id && (skipConfirm || confirm('Are you sure you want to permanently delete this?'))){
				$scope.bands.$remove(band);
			}
		};
	}])
	.controller('GroupsCtrl', ["$scope", "$state", "$q", "$http", "$firebaseHelper", function($scope, $state, $q, $http, $firebaseHelper){
		$scope.userInGroup = function(user_id, group){
			return group && group.users ? !! group.users[user_id] : false;
		};
		$scope.addUserToGroup = function(user_id, group_id, event_id){
			// @TODO: what if user is already in a group? (!)
			var d1 = $q.defer(),
				d2 = $q.defer();
			
			$firebaseHelper.ref('users', user_id, 'groups', event_id, group_id).set(group_id, d1.resolve);
			$firebaseHelper.ref('groups', event_id, group_id, 'users', user_id).set(user_id, d2.resolve);
			
			return $q.all([d1.promise, d2.promise]);
		};
		$scope.removeUserFromGroup = function(user_id, group_id, event_id, skipConfirm){
			if(skipConfirm || confirm('Are you sure you want to remove this user from this group?')){
				var d1 = $q.defer(),
					d2 = $q.defer();
				
				$firebaseHelper.ref('users', user_id, 'groups', event_id, group_id).remove(function(err){ if(err) d1.reject(); else d1.resolve(); });
				$firebaseHelper.ref('groups', event_id, group_id, 'users', user_id).remove(function(err){ if(err) d2.reject(); else d2.resolve(); });
				
				return $q.all([d1.promise, d2.promise]);
			}
		};
		$scope.invite = function($group){
			$scope.$authThen(function(){
				FB.ui({
					method: 'apprequests',
					title: 'Group Members',
					message: 'Let\'s figure out which bands we all want to see this event.',
				}, function(response){
					if( ! response){
						console.error('Facebook Error: No Response');
					}else if(response.error){
						console.error('Facebook Error: ' + response.error);
					}else{
						if(response.to){
							var link = function(){
								$group.$loaded().then(function(){
									// add all invited users to group
									angular.forEach(response.to, function(fbid){
										var uid = 'facebook:' + fbid;
										
										// fetch some basic user info for user-friendly identification purposes
										$http.get('https://graph.facebook.com/' + fbid).then(function(response){
											if(response && response.data){
												var $user = $firebaseHelper.ref('users', uid);
												$user.child('uid').set(uid);
												$user.child('facebook').update(response.data);
												$user.child('facebook/displayName').set(response.data.name); // @HACK
											}
										});
										
										// add the link
										$scope.addUserToGroup(uid, $group.$id, $state.params.event);
									});
									// include self
									$scope.addUserToGroup($scope.$me.uid, $group.$id, $state.params.event);
								});
							};
							if( ! $group){
								// create a new group
								$firebaseHelper.array('groups', $state.params.event).$add().then(function(groupRef){
									var group_id = groupRef.key();
									$group = $firebaseHelper.object('groups', $state.params.event, group_id);
									
									link();
									
									$state.go('group', {group: group_id});
								});
							}else{
								link();
							}
						}
					}
				});
			});
		}
	}])
	
	.directive('ngAutofocus', function(){
		return {
			restrict: 'A',
			link: function(scope, element, attrs){
				scope.$watch(function(){
					return scope.$eval(attrs.ngAutofocus);
				},function (v){
					if(v) element[0].focus(); // use focus function instead of autofocus attribute to avoid cross browser problem. And autofocus should only be used to mark an element to be focused when page loads.
				});
			}
		};
	})
	.filter('filterVotesByGroup', ["$firebaseHelper", function($firebaseHelper){
		return function(votes, group){
			var filtered = [];
			if(votes && group && group.users){
				angular.forEach(votes, function(vote, user_id){
					if( !! group.users[user_id]){
						vote.$user = $firebaseHelper.object('users', user_id);
						filtered.push(vote);
					}
				});
			}
			return filtered;
		};
	}]);
	
	
	// @TODO: security rules