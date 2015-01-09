angular.module('coachella', ['ui.router', 'ui.bootstrap', 'firebase', 'firebaseHelper'])
	
	.config(function($locationProvider, $urlRouterProvider, $stateProvider){
		$urlRouterProvider.when('',  '/');
		$stateProvider
			// pages
			.state('year', {
				url: '/:year',
				templateUrl: 'views/year.html',
			})
				.state('year.group', {
					url: '/:group',
				})
			.state('year:edit', {
				url: '/:year/edit',
				templateUrl: 'views/edit.html',
				resolve: {
					authorization: function($rootScope, $q){
						var deferred = $q.defer();
					
						if($rootScope.$me.uid == 'facebook:120605287' /* Murray Smith */){
							deferred.resolve();
						}else{
							deferred.reject();
						}
						
						return deferred.promise;
					},
				},
			});
	})
	
	.controller('AppCtrl', function($rootScope, $state, $firebaseHelper){
		$firebaseHelper.namespace('coachellalp');
		$rootScope.$state = $state;
		
		var refreshAuthState = function(){
			if( ! $rootScope.$me || ! $rootScope.$me.$loaded) return;
			
			$rootScope.$me.$loaded().then(function(me){
				// check if user is already in a group this year, and redirect there if so
				if($state.params.year && me.groups && me.groups[$state.params.year]){
					$state.go('year.group', {year: $state.params.year, group: me.groups[$state.params.year]});
				}
			});
		};
		$rootScope.$me = {};
		$rootScope.$auth = $firebaseHelper.$auth();
		$rootScope.$auth.$onAuth(function(authData){
			if(authData){
				// logging in
				$rootScope.$me = $firebaseHelper.$get('users/' + authData.uid); // fetch existing user profile
				$rootScope.$me.$inst().$update(authData); // update it w/ any changes since last login
				refreshAuthState();
			}else{
				$rootScope.$me = {};
				// page loaded or refreshed while not logged in, or logging out
			}
		});
		$rootScope.$authThen = function(callback){
			if ( ! $rootScope.$me.uid){
				$rootScope.$auth.$authWithOAuthPopup('facebook').then(function(authData){
					callback(authData.uid);
				}, function(error){
					console.error(error);
				});
			}else{
				callback();
			}
		};
		
		$rootScope.$on('$stateChangeSuccess', function(){
			$state.params.year = $state.params.year || 2015; // default year
			
			$rootScope.bands = $firebaseHelper.$get('bands/' + $state.params.year, true);
			
			if($state.params.group){ // group is explicitly specified
				$rootScope.group = $firebaseHelper.$get('groups/' + $state.params.year + '/' + $state.params.group);
				
				$rootScope.users = $firebaseHelper.$get('users'); // @TODO: only load those in group
			}else{ // no group explicitly specified
				$rootScope.group = $rootScope.users = undefined;
				
				refreshAuthState();
			}
		})
	})
	.controller('BandsCtrl', function($scope, $firebaseHelper){
		// voting
		$scope.vote = function(band_id, vote){
			$scope.$authThen(function(uid){
				var $item = $firebaseHelper.$child($scope.bands, band_id + '/votes/' + (uid || $scope.$me.uid) + '/vote')
				$item.$asObject().$loaded().then(function(item){
					if(item.$value == vote){
						$item.$remove();
					} else {
						$item.$set(vote);
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
	})
	.controller('BandCtrl', function($scope){
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
			}
		};
		$scope.remove = function(band, skipConfirm){
			if(band && band.$id && (skipConfirm || confirm('Are you sure you want to permanently delete this?'))){
				$scope.bands.$remove(band);
			}
		};
	})
	.controller('GroupsCtrl', function($scope, $state, $q, $firebaseHelper){
		$scope.userInGroup = function(user_id, group){
			return group && group.users ? !! group.users[user_id] : false;
		};
		$scope.addUserToGroup = function(user_id, group_id, year){
			// @TODO: what if user is already in a group?
			return $q.all([
				$firebaseHelper.$inst('users', user_id, 'groups').$set(year, group_id),
				$firebaseHelper.$inst('groups', year, group_id, 'users').$set(user_id, user_id),
			]);
		};
		$scope.removeUserFromGroup = function(user_id, group_id, year, skipConfirm){
			if(skipConfirm || confirm('Are you sure you want to remove this user from this group?')){
				return $q.all([
					$firebaseHelper.$inst('users', user_id, 'groups').$remove(year),
					$firebaseHelper.$inst('groups', year, group_id, 'users').$remove(user_id),
				]);
			}
		};
		$scope.invite = function(){
			$scope.$authThen(function(){
				FB.ui({
					method: 'apprequests',
					title: 'Group Members',
					message: 'Let\'s figure out which bands we all want to see this year.',
				}, function(response){
					if( ! response){
						console.error('Facebook Error: No Response');
					}else if(response.error){
						console.error('Facebook Error: ' + response.error);
					}else{
						if(response.to){
							var link = function(){
								$scope.group.$loaded().then(function(){
									// add all invited users to group
									response.to.push($scope.$me.facebook.id); // include self
									angular.forEach(response.to, function(fbid){
										var uid = 'facebook:' + fbid;
										
										$scope.addUserToGroup(uid, $scope.group.$id, $state.params.year);
									});
								});
							};
							if( ! $scope.group){
								// create a new group
								$firebaseHelper.$get('groups', $state.params.year, true).$add().then(function(groupRef){
									var group_id = groupRef.key();
									$scope.group = $firebaseHelper.$get('groups', $state.params.year, group_id);
									
									link();
									
									$state.go('year.group', {group: group_id});
								});
							}else{
								link();
							}
						}
					}
				});
			});
		}
	})
	
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
	
	
	
	// @TODO: get user name from facebook based on id somehow / reimplement user inviting based on emails instead?
	// @TODO: get vote grouping actually working
	// @TODO: security rules